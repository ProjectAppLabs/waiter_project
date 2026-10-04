import hashlib
import uuid
from decimal import Decimal
from unittest.mock import patch
import pytest
from cryptography.fernet import Fernet
from experience_app.models import PaymentGateway, PaymentAttempt, Order
from experience_app.payments.crypto import encrypt, decrypt, PaymentUnavailable
from experience_app.payments import wompi
from experience_app.services import online_payments as service
from experience_app.tests.conftest import TABLE
from experience_app.adapters.core.pos import PlacedOrder

pytestmark = pytest.mark.django_db
SECRETS={'private_key':'prv_test_12345678','events':'test_events_12345678','integrity':'test_integrity_12345678'}
MERCHANT={'name':'Demo','accepted_payment_methods':wompi.METHODS,'presigned_acceptance':{'acceptance_token':'terms','permalink':'https://wompi.co/terms'},'presigned_personal_data_auth':{'acceptance_token':'personal','permalink':'https://wompi.co/privacy'}}

@pytest.fixture(autouse=True)
def configuration(settings):
    settings.PAYMENTS_FERNET_KEY=Fernet.generate_key().decode()
    settings.EXPERIENCE_INTERNAL_KEY='internal-test'
    settings.PAYMENTS_LIVE_ENABLED=False
    settings.PAYMENTS_PUBLIC_URL=''

@pytest.fixture
def setup(api_client,two_diners):
    session,ana,beto=two_diners
    api_client.cookies['waiter_diner']=ana.key
    order=Order.objects.create(session=session,state=Order.SENT,odoo_order_id=77,total=Decimal('51051'))
    gateway=PaymentGateway.objects.create(restaurant_slug=session.restaurant_slug,venue_slug=session.venue_slug,public_key='pub_test_12345678',environment='test',enabled=True,secrets_cipher=encrypt(SECRETS))
    with patch('experience_app.services.online_payments.resolve',return_value=TABLE),patch.object(wompi,'merchant',return_value=MERCHANT),patch.object(service.pos,'read_order',return_value=PlacedOrder(77,'Order','draft',51051,0,0)):
        yield session,ana,beto,order,gateway

def data(method='BANCOLOMBIA_QR'):
    return {'id':str(uuid.uuid4()),'method':method,'email':'test@example.com','accepted':True,'personal_data_accepted':True,'acceptance_token':'terms','accept_personal_auth':'personal','expected_amount_in_cents':5105100}

def remote(attempt,status='PENDING'):
    return {'id':'tx-123','reference':attempt.reference,'status':status,'amount_in_cents':attempt.amount_in_cents,'currency':'COP','payment_method_type':attempt.method,'payment_method':{'extra':{'qr_image':'PHN2Zy8+','async_payment_url':'https://sandbox.wompi.co/auth'}}}

def endpoint(session):return f'/api/v1/sesiones/{session.id}/pagos/'

def event(attempt,status='APPROVED'):
    body={'event':'transaction.updated','environment':attempt.gateway.environment,'data':{'transaction':remote(attempt,status)},'timestamp':1700000000,'signature':{'properties':['transaction.id','transaction.status','transaction.amount_in_cents']}}
    body['signature']['checksum']=hashlib.sha256(f"tx-123{status}{attempt.amount_in_cents}1700000000{SECRETS['events']}".encode()).hexdigest()
    return body

def attempt(setup,**kw):
    s,a,b,o,g=setup
    return PaymentAttempt.objects.create(gateway=g,session=s,diner=a,order=o,amount_in_cents=5105100,method='BANCOLOMBIA_QR',credentials_cipher=encrypt(SECRETS),**kw)

# Falla si las credenciales de pago se guardan sin cifrar o se devuelven al cliente.
def test_configuration_is_internal_encrypted_and_does_not_echo_secrets(api_client):
    url='/internal/v1/burger-house/poblado/pasarelas/'
    assert api_client.get(url).status_code==401
    body={'environment':'test','public_key':'pub_test_12345678',**SECRETS,'enabled':True}
    with patch('experience_app.views.payment_gateways.resolve',return_value=TABLE):
        response=api_client.put(url,body,format='json',HTTP_X_INTERNAL_KEY='internal-test')
    assert response.status_code==200
    saved=PaymentGateway.objects.get()
    assert SECRETS['private_key'] not in saved.secrets_cipher
    assert decrypt(saved.secrets_cipher)==SECRETS
    assert all(v not in response.content.decode() for v in SECRETS.values())
    assert response['Cache-Control']=='no-store'
    response=api_client.get(url,HTTP_X_INTERNAL_KEY='internal-test')
    assert response.json()['configurations'][0]['configured']['events'] is True

# Falla si una configuración inválida deja cambios parciales.
@pytest.mark.parametrize('change',[{'private_key':'prv_prod_12345678'},{'enabled':'yes'},{'amount':1},{'environment':'oops'}])
def test_bad_settings_fail_atomically(api_client,change):
    with patch('experience_app.views.payment_gateways.resolve',return_value=TABLE):
        r=api_client.put('/internal/v1/burger-house/poblado/pasarelas/',{'environment':'test','public_key':'pub_test_12345678',**SECRETS,**change},format='json',HTTP_X_INTERNAL_KEY='internal-test')
    assert r.status_code==400
    assert not PaymentGateway.objects.exists()

# Falla si un campo vacío borra secretos o permite activar cobros reales sin habilitación.
def test_blank_preserves_secret_and_live_activation_is_blocked(api_client,setup):
    url='/internal/v1/burger-house/poblado/pasarelas/'
    with patch('experience_app.views.payment_gateways.resolve',return_value=TABLE):
        r=api_client.put(url,{'environment':'test','private_key':'','enabled':False},format='json',HTTP_X_INTERNAL_KEY='internal-test')
        assert r.status_code==200
        assert decrypt(PaymentGateway.objects.get(environment='test').secrets_cipher)==SECRETS
        r=api_client.put(url,{'environment':'prod','enabled':True,'public_key':'pub_prod_12345678',**{k:v.replace('test','prod') for k,v in SECRETS.items()}},format='json',HTTP_X_INTERNAL_KEY='internal-test')
        assert r.status_code==400
    assert not PaymentGateway.objects.filter(environment='prod').exists()

# Falla si el contexto de pago expone datos ajenos o acepta el monto del navegador.
def test_pending_context_private_to_payer_and_amount_from_pos(api_client,setup):
    s,a,b,o,g=setup
    p=attempt(setup)
    response=api_client.get(endpoint(s))
    assert response.status_code==200
    assert response.json()['amount_in_cents']==5105100
    assert response.json()['attempt']['id']==str(p.id)
    api_client.cookies['waiter_diner']=b.key
    response=api_client.get(endpoint(s))
    assert response.json()['attempt'] is None
    assert response.json()['other_payment_pending'] is True
    assert api_client.get(endpoint(s)+f'{p.id}/').status_code==404

# Falla si dos solicitudes generan dos cobros en el proveedor.
def test_create_double_click_and_second_device_never_double_post(api_client,setup):
    s,a,b,o,g=setup
    body=data()
    def created(*args):return {'id':'tx-123'}
    def read(*args):return remote(PaymentAttempt.objects.get())
    with patch.object(wompi,'create',side_effect=created) as post,patch.object(wompi,'read',side_effect=read):
        r=api_client.post(endpoint(s),body,format='json')
        assert r.status_code==200,r.content
        assert r.json()['status']=='PENDING'
        assert r.json()['qr_image']=='PHN2Zy8+'
        assert api_client.post(endpoint(s),body,format='json').status_code==200
        api_client.cookies['waiter_diner']=b.key
        assert api_client.post(endpoint(s),data(),format='json').status_code==409
        assert post.call_count==1
    assert PaymentAttempt.objects.count()==1

# Falla si datos manipulados o sin consentimiento llegan al proveedor.
@pytest.mark.parametrize('change',[{'expected_amount_in_cents':1},{'accepted':False},{'personal_data_accepted':False},{'amount':1},{'number':'4242424242424242'}])
def test_tampering_and_missing_consent_never_reach_provider(api_client,setup,change):
    with patch.object(wompi,'create') as post:
        r=api_client.post(endpoint(setup[0]),{**data(),**change},format='json')
    assert r.status_code in (400,409)
    post.assert_not_called()
    assert not PaymentAttempt.objects.exists()

# Falla si el pago acepta un origen ajeno o una petición sin cookie.
def test_foreign_origin_and_missing_cookie_rejected(api_client,setup):
    assert api_client.post(endpoint(setup[0]),data(),format='json',HTTP_ORIGIN='https://evil.invalid').status_code==403
    api_client.cookies.clear()
    assert api_client.get(endpoint(setup[0])).status_code==404

# Falla si un timeout pierde el intento y genera un segundo cobro.
def test_timeout_retains_attempt_and_never_reposts(api_client,setup):
    body=data()
    with patch.object(wompi,'create',side_effect=PaymentUnavailable()) as post:
        r=api_client.post(endpoint(setup[0]),body,format='json')
        assert r.json()['status']=='UNKNOWN'
        assert api_client.post(endpoint(setup[0]),body,format='json').json()['status']=='UNKNOWN'
        assert post.call_count==1

# Falla si un pago de prueba liquida ventas o cierra la visita.
def test_paid_sandbox_does_not_pay_pos_or_close_visit(api_client,setup):
    p=attempt(setup,provider_id='tx-123')
    with patch.object(wompi,'read',return_value=remote(p,'APPROVED')),patch.object(service,'close_paid') as close,patch.object(service,'Client') as client:
        r=api_client.get(endpoint(setup[0])+f'{p.id}/')
    assert r.json()['status']=='APPROVED'
    assert r.json()['reconciled'] is False
    close.assert_not_called();client.assert_not_called()

# Falla si el webhook no recupera un timeout o duplica los efectos del pago.
def test_verified_webhook_recovers_timeout_and_duplicate_is_harmless(api_client,setup):
    p=attempt(setup,status='UNKNOWN')
    url='/api/v1/pagos/webhooks/wompi/burger-house/poblado/test/'
    with patch.object(wompi,'read',return_value=remote(p,'APPROVED')):
        assert api_client.post(url,event(p),format='json').status_code==200
        assert api_client.post(url,event(p),format='json').status_code==200
    p.refresh_from_db()
    assert (p.status,p.provider_id)==('APPROVED','tx-123')

# Falla si un webhook inválido aprueba un cobro.
@pytest.mark.parametrize('tamper',['signature','tenant','environment','amount','reference'])
def test_bad_webhook_cannot_approve(api_client,setup,tamper):
    p=attempt(setup,provider_id='tx-123')
    body=event(p)
    url='/api/v1/pagos/webhooks/wompi/burger-house/poblado/test/'
    verified=remote(p,'APPROVED')
    if tamper=='signature':body['signature']['checksum']='0'*64
    if tamper=='tenant':url=url.replace('burger-house','other')
    if tamper=='environment':body['environment']='prod'
    if tamper=='amount':verified['amount_in_cents']=1
    if tamper=='reference':verified['reference']='waiter-'+uuid.uuid4().hex
    with patch.object(wompi,'read',return_value=verified):
        api_client.post(url,body,format='json')
    p.refresh_from_db()
    assert p.status=='CREATING'

# Falla si una notificación atrasada revierte un pago aprobado.
def test_old_pending_does_not_undo_approval(setup):
    p=attempt(setup,status='APPROVED',provider_id='tx-123')
    assert service.apply_remote(p,remote(p,'PENDING')).status=='APPROVED'

# Falla si la conciliación pierde un pago al fallar ventas o duplica sus efectos al reintentar.
def test_live_reconciliation_retry_after_core_unavailable(setup,settings):
    settings.PAYMENTS_LIVE_ENABLED=True
    p=attempt(setup,status='APPROVED',provider_id='tx-123',payment_method_id=2)
    p.gateway.environment='prod';p.gateway.save()
    from django.db import OperationalError
    with patch.object(service,'Client') as client:
        client.return_value.call_kw.side_effect=OperationalError('offline')
        p=service.reconcile(p)
        assert p.needs_review and not p.reconciled
        client.return_value.call_kw.side_effect=None
        client.return_value.call_kw.return_value={'paid':True}
        p=service.reconcile(p)
        assert p.reconciled and not p.needs_review
        p.session.refresh_from_db();assert p.session.state=='paid'
        service.reconcile(p)
        assert client.return_value.call_kw.call_count==2

# Falla si la firma o los campos enviados a Wompi no corresponden al cobro.
def test_wompi_signature_and_request_fields(setup):
    p=attempt(setup)
    with patch.object(wompi,'api',return_value={'id':'tx'}) as api:
        wompi.create('test',SECRETS,p,data(),'https://menu.example/pago/')
    args=api.call_args.args
    assert args[0:2]==('test','/transactions')
    payload=args[3]
    assert payload['amount_in_cents']==5105100
    assert payload['payment_method']['type']=='BANCOLOMBIA_QR'
    assert payload['signature']==hashlib.sha256(f'{p.reference}5105100COP{SECRETS["integrity"]}'.encode()).hexdigest()
    assert not any(v in str(payload) for v in SECRETS.values())

# Falla si las credenciales del comercio se filtran en la URL.
def test_new_merchant_endpoint_uses_header_not_url():
    with patch.object(wompi,'api',return_value=MERCHANT) as api:
        wompi.merchant('test','pub_test_12345678')
    api.assert_called_once_with('test','/merchants/info',headers={'x-merchant-public-key':'pub_test_12345678'})

# Falla si un medio de pago recibe los campos de otro.
@pytest.mark.parametrize('method,extra,expected',[
    ('NEQUI',{'phone_number':'3001234567'},{'type':'NEQUI','phone_number':'3001234567'}),
    ('CARD',{'token':'tok_test_12345678','installments':3},{'type':'CARD','token':'tok_test_12345678','installments':3}),
    ('BANCOLOMBIA_TRANSFER',{}, {'type':'BANCOLOMBIA_TRANSFER','payment_description':'Cuenta restaurante','user_type':'PERSON','ecommerce_url':'https://menu.example/pago/'}),
])
# Falla si Nequi, tarjeta o transferencia recibe campos de otro medio de pago.
def test_each_native_method_has_its_own_payload(setup,method,extra,expected):
    p=attempt(setup);p.method=method
    with patch.object(wompi,'api',return_value={'id':'tx'}) as api:
        wompi.create('test',SECRETS,p,{**data(method),**extra,'browser_info':{}},'https://menu.example/pago/')
    assert api.call_args.args[3]['payment_method']==expected

# Falla si el desafío de autenticación se interpreta mal o permanece tras completarse.
def test_challenge_is_decoded_and_removed_after_authentication(setup):
    p=attempt(setup,provider_id='tx-123')
    response=remote(p)
    response['payment_method']['extra'].update(brand='MASTERCARD',three_ds_auth={'current_step':'CHALLENGE','three_ds_method_data':'&lt;iframe src="https://bank.example/challenge"&gt;&lt;/iframe&gt;'})
    p=service.apply_remote(p,response)
    assert p.challenge_html=='<iframe src="https://bank.example/challenge"></iframe>'
    response['payment_method']['extra']['three_ds_auth']['current_step']='AUTHENTICATION'
    p=service.apply_remote(p,response)
    assert p.challenge_html==''


# Falla si una confirmación cambia el pedido mientras se está pagando.
def test_pending_payment_blocks_new_kitchen_confirmation(setup):
    from experience_app.services.orders import confirm
    p=attempt(setup,provider_id='tx-123',status='PENDING')
    with pytest.raises(service.PaymentConflict):
        confirm(p.session,p.diner)
    p.session.refresh_from_db()
    assert p.session.confirming is False

# Falla si finalizar una prueba borra la auditoría o impide otro intento.
def test_finish_sandbox_preserves_audit_and_visit_allows_another_attempt(api_client,setup):
    p=attempt(setup,status='APPROVED',provider_id='tx-123')
    assert api_client.delete(endpoint(setup[0])+f'{p.id}/').status_code==200
    p.refresh_from_db();assert p.status=='TEST_COMPLETED'
    p.session.refresh_from_db();assert p.session.state=='composing'
    assert not p.session.payments.filter(status__in=service.ACTIVE).exists()
    assert service.apply_remote(p,remote(p,'APPROVED')).status=='TEST_COMPLETED'

# Falla si se permite finalizar manualmente un pago real como una prueba.
def test_finish_is_forbidden_for_live_payments(api_client,setup):
    p=attempt(setup,status='APPROVED',provider_id='tx-123');p.gateway.environment='prod';p.gateway.save()
    assert api_client.delete(endpoint(setup[0])+f'{p.id}/').status_code==400
    p.refresh_from_db();assert p.status=='APPROVED'

# Falla si el pedido pendiente de pago no se puede cobrar antes de cocina.
def test_checkout_is_payable_before_it_has_been_sent_to_kitchen(api_client,setup):
    session,ana,beto,order,gateway=setup
    order.state=Order.CHECKOUT;order.requires_payment=True;order.save()
    assert api_client.get(endpoint(session)).json()['amount_in_cents']==5105100
    with patch.object(wompi,'create',return_value={'id':'tx-123'}),patch.object(wompi,'read',side_effect=lambda *args:remote(PaymentAttempt.objects.get(),'PENDING')):
        r=api_client.post(endpoint(session),data(),format='json')
    assert r.status_code==200
    order.refresh_from_db();assert order.state==Order.CHECKOUT

# Falla si el prepago no habilita cocina o cierra la visita antes del servicio.
def test_approved_prepayment_marks_sent_but_does_not_end_visit(setup,settings):
    p=attempt(setup,status='APPROVED',provider_id='tx-123',payment_method_id=2)
    p.gateway.environment='prod';p.gateway.save()
    p.order.requires_payment=True;p.order.state=Order.CHECKOUT;p.order.save()
    with patch.object(service,'Client') as client:
        client.return_value.call_kw.return_value={'paid':True}
        p=service.reconcile(p)
    assert p.reconciled
    p.order.refresh_from_db();assert p.order.state==Order.SENT
    assert p.order.sent_at is not None
    p.session.refresh_from_db();assert p.session.state!='paid'
