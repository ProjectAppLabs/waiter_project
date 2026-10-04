from django.urls import reverse


# Falla si la ruta de salud no responde correctamente o identifica otro proyecto.
def test_health_reports_ok_and_who_answered(api_client):
    """Atrapa un despliegue que responde desde otro proyecto (convención del fleet)."""
    response = api_client.get(reverse('health-check'))
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['project'] == 'experience'
