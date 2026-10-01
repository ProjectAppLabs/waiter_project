"""Plan M: ejecutar con el runner de Odoo, sobre una base de pruebas desechable."""
import base64
import io
from datetime import timedelta

from PIL import Image

from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, new_test_user, tagged

from ..utils.images import MAX_IMAGE_BYTES, to_webp


def encoded_image(size=(80, 40), mode="RGB", color=None, format="PNG", **kwargs):
    image = Image.new(mode, size, color or ((35, 100, 180, 100) if mode == "RGBA" else (35, 100, 180)))
    stream = io.BytesIO()
    image.save(stream, format=format, **kwargs)
    return base64.b64encode(stream.getvalue())


def decoded_image(value):
    image = Image.open(io.BytesIO(base64.b64decode(value)))
    image.load()
    return image


@tagged("post_install", "-at_install")
class TestProductPhotoOptimization(TransactionCase):
    # // Falla si PNG, JPEG o WebP no se convierten a WebP de hasta 1600 px con medidas y peso reales.
    def test_formats_resize_and_metadata(self):
        for format in ("PNG", "JPEG", "WEBP"):
            with self.subTest(format=format):
                encoded, width, height, size = to_webp(encoded_image((2000, 1000), format=format))
                image = decoded_image(encoded)
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(image.mode, "RGB")
                self.assertEqual((width, height), (1600, 800))
                self.assertEqual(image.size, (width, height))
                self.assertEqual(size, len(base64.b64decode(encoded)))

    # // Falla si una foto pequeña se agranda o pierde su transparencia al optimizarla.
    def test_no_upscale_and_alpha(self):
        encoded, width, height, _size = to_webp(encoded_image(mode="RGBA"))
        image = decoded_image(encoded)
        self.assertEqual((width, height), (80, 40))
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.getpixel((0, 0))[3], 100)

    # // Falla si una transparencia indexada en PNG acaba reemplazada por un fondo opaco.
    def test_palette_transparency(self):
        image = Image.new("P", (12, 8), 0)
        stream = io.BytesIO()
        image.save(stream, format="PNG", transparency=0)
        output = decoded_image(to_webp(base64.b64encode(stream.getvalue()))[0])
        self.assertEqual(output.mode, "RGBA")
        self.assertEqual(output.getpixel((0, 0))[3], 0)

    # // Falla si una foto de móvil se guarda girada o conserva los metadatos EXIF originales.
    def test_exif_orientation_is_applied_and_removed(self):
        exif = Image.Exif()
        exif[274] = 6
        encoded, width, height, _size = to_webp(encoded_image((80, 40), format="JPEG", exif=exif))
        image = decoded_image(encoded)
        self.assertEqual((width, height), (40, 80))
        self.assertFalse(image.getexif())

    # // Falla si el optimizador acepta basura, imágenes truncadas o más de 12 MB antes de convertir.
    def test_invalid_inputs_and_upload_limit(self):
        for invalid in (False, None, 10, "", "no es base64", "á", base64.b64encode(b"<svg/>"),
                        base64.b64encode(b"\x89PNG\r\n\x1a\n")):
            with self.subTest(value=invalid), self.assertRaises(UserError):
                to_webp(invalid)
        with self.assertRaisesRegex(UserError, "12 MB"):
            to_webp(base64.b64encode(b"x" * (MAX_IMAGE_BYTES + 1)))
        raw = base64.b64decode(encoded_image())
        exact_limit = base64.b64encode(raw + b"\0" * (MAX_IMAGE_BYTES - len(raw)))
        self.assertEqual(to_webp(exact_limit)[1:3], (80, 40))


@tagged("post_install", "-at_install")
class TestProductPhotos(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Q1 reserva la edición de la galería al dueño; el encargado se prueba en test_business_permissions.
        cls.admin = new_test_user(cls.env, login="galeria_admin", waiter_role="owner")
        cls.waiter = new_test_user(cls.env, login="galeria_mesero", waiter_role="waiter")
        cls.Product = cls.env["product.template"].with_user(cls.admin)
        cls.Photo = cls.env["projectapp.product.photo"].with_user(cls.admin)
        cls.product = cls.Product.create({"name": "Plato con galería", "available_in_pos": True})
        cls.other = cls.Product.create({"name": "Otro plato"})
        cls.employee = cls.env["hr.employee"].create({
            "name": "Administradora de galería", "waiter_role": "admin", "company_id": cls.env.company.id,
        })
        cls.token = cls.employee._waiter_new_session()
        cls.image = encoded_image()

    def _photo(self, product=None, **values):
        return self.Photo.create({"product_tmpl_id": (product or self.product).id, "image": self.image, **values})

    def _set(self, photos, **kwargs):
        return self.Product.waiter_set_catalog_photos(
            kwargs.get("template_id", self.product.id), photos,
            kwargs.get("employee_id", self.employee.id), kwargs.get("employee_token", self.token),
        )

    # // Falla si create/write conserva PNG o si Odoo deja la imagen WebP completa en image_512/image_1024.
    def test_main_image_and_all_thumbnails_are_webp_after_reloading(self):
        product = self.Product.create({"name": "Foto grande", "image_1920": encoded_image((2400, 1200))})
        names = [f"image_{size}" for size in (1920, 1024, 512, 256, 128)]
        self.env.flush_all()
        product.invalidate_recordset(names)
        for size, expected in ((1920, (1600, 800)), (1024, (1024, 512)), (512, (512, 256)),
                               (256, (256, 128)), (128, (128, 64))):
            image = decoded_image(product.with_context(bin_size=False)[f"image_{size}"])
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, expected)
        product.write({"image_1920": self.image})
        self.env.flush_all()
        product.invalidate_recordset(names)
        for name in names:
            self.assertEqual(decoded_image(product[name]).size, (80, 40))
        product.write({"image_1920": False})
        self.env.flush_all()
        product.invalidate_recordset(names)
        self.assertTrue(all(not product[name] for name in names))

    # // Falla si escribir la principal por RPC o crear varios platos omite la validación del optimizador.
    def test_main_image_validation_and_batch_create(self):
        records = self.Product.create([
            {"name": "Principal A", "image_1920": self.image},
            {"name": "Principal B", "image_1920": encoded_image(format="JPEG")},
        ])
        self.assertTrue(all(decoded_image(p.image_1920).format == "WEBP" for p in records))
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.product.write({"image_1920": "no es una imagen"})
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.Product.create({"name": "Foto inválida", "image_1920": "no es una imagen"})

    # // Falla si el backoffice evita la conversión, falsifica medidas o no actualiza el peso al cambiar la foto.
    def test_direct_gallery_create_and_write_derive_metadata(self):
        photo = self._photo(width=999, height=999, file_size=1)
        self.assertEqual((photo.width, photo.height), (80, 40))
        self.assertEqual(decoded_image(photo.image).format, "WEBP")
        self.assertEqual(photo.file_size, len(base64.b64decode(photo.image)))
        photo.write({"image": encoded_image((60, 30)), "width": 999})
        self.assertEqual((photo.width, photo.height), (60, 30))
        photo.write({"width": 1, "height": 1, "file_size": 1})
        self.assertEqual((photo.width, photo.height), (60, 30))
        self.assertEqual(photo.file_size, len(base64.b64decode(photo.image)))
        with self.assertRaises(UserError), self.env.cr.savepoint():
            photo.write({"image": False})

    # // Falla si se supera el máximo de cuatro por create, por lotes o trasladando una foto desde otro plato.
    def test_gallery_limit_for_all_orm_entrypoints(self):
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self.Photo.create([{"product_tmpl_id": self.product.id, "image": self.image} for _ in range(5)])
        for _ in range(4):
            self._photo()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            self._photo()
        other_photo = self._photo(self.other)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            other_photo.write({"product_tmpl_id": self.product.id})
        self.assertEqual(len(self.product.diner_photo_ids), 4)

    # // Falla si un mesero puede escribir, borrar o crear fotos, o si el gestor del POS no puede hacerlo.
    def test_pos_access_rights(self):
        photo = self._photo()
        self.assertEqual(photo.with_user(self.waiter).read(["width"])[0]["width"], 80)
        for action in (
            lambda: photo.with_user(self.waiter).write({"sequence": 2}),
            lambda: photo.with_user(self.waiter).unlink(),
            lambda: self.Photo.with_user(self.waiter).create({"product_tmpl_id": self.product.id, "image": self.image}),
        ):
            with self.assertRaises(AccessError), self.env.cr.savepoint():
                action()
        photo.write({"sequence": 2})
        photo.unlink()
        self.assertFalse(photo.exists())

    # // Falla si el orden por sequence/id cambia o sobreviven fotos al borrar su plantilla.
    def test_order_and_cascade(self):
        first = self._photo(sequence=2)
        second = self._photo(sequence=1)
        third = self._photo(sequence=1)
        self.assertEqual(self.product.diner_photo_ids.ids, [second.id, third.id, first.id])
        ids = self.product.diner_photo_ids.ids
        # La copia de la base de desarrollo puede tener una sesión del POS abierta, y Odoo no deja borrar un producto
        # vendible mientras la haya; la cascada de las fotos no depende de eso.
        self.product.available_in_pos = False
        self.product.unlink()
        self.assertFalse(self.Photo.browse(ids).exists())

    # // Falla si reemplazar cuatro fotos borra las retenidas, pierde su orden o devuelve metadatos incorrectos.
    def test_gateway_replaces_reorders_and_clears(self):
        original = self._set([{"image": self.image.decode()} for _ in range(4)])
        result = self._set([{"id": original[3]["id"]}, {"image": self.image.decode()}, {"id": original[0]["id"]}])
        self.assertEqual([p["id"] for p in result], self.product.diner_photo_ids.ids)
        self.assertEqual(self.product.diner_photo_ids.mapped("sequence"), [0, 1, 2])
        self.assertFalse(self.Photo.browse([original[1]["id"], original[2]["id"]]).exists())
        for row in result:
            self.assertEqual(set(row), {"id", "width", "height", "size"})
            self.assertEqual((row["width"], row["height"]), (80, 40))
            self.assertEqual(row["size"], self.Photo.browse(row["id"]).file_size)
        self.assertEqual(self._set([]), [])
        self.assertFalse(self.product.diner_photo_ids)

    # // Falla si ids ajenos, duplicados o datos inválidos se aceptan, o si un fallo deja la galería parcialmente borrada.
    def test_gateway_rejects_bad_payloads_atomically(self):
        photo = self._photo()
        foreign = self._photo(self.other)
        invalid = [None, {}, [{"image": self.image}] * 5, [{"id": foreign.id}],
                   [{"id": photo.id}, {"id": photo.id}], [{"id": str(photo.id)}], [{"id": True}],
                   [{"id": photo.id, "image": self.image}], [{}], [1], [{"image": "inválida"}],
                   [{"image": self.image}, {"image": "inválida"}]]
        for photos in invalid:
            with self.subTest(photos=photos), self.assertRaises(UserError):
                self._set(photos)
            self.assertEqual(self.product.diner_photo_ids.ids, [photo.id])
        for template_id in (None, 0, True, "1", 2_000_000_000):
            with self.subTest(template_id=template_id), self.assertRaises(UserError):
                self._set([], template_id=template_id)

    # // Falla si basta la sesión del terminal o si se acepta un token incorrecto, caducado o de otro empleado.
    def test_gateway_requires_valid_admin_employee_session(self):
        for employee_id, token in ((self.employee.id, "incorrecto"), (self.employee.id, None), (False, self.token),
                                   ("1", self.token), (2_000_000_000, self.token)):
            with self.assertRaises(AccessError):
                self._set([], employee_id=employee_id, employee_token=token)
        other = self.env["hr.employee"].create({"name": "Otra administradora", "waiter_role": "admin"})
        with self.assertRaises(AccessError):
            self._set([], employee_id=other.id)
        self.employee.waiter_session_expires = fields.Datetime.now() - timedelta(seconds=1)
        with self.assertRaises(AccessError):
            self._set([])

    # // Falla si el terminal o el empleado no son administradores, o si el empleado está inactivo.
    def test_gateway_requires_both_admin_roles_and_active_employee(self):
        with self.assertRaises(AccessError):
            self.Product.with_user(self.waiter).waiter_set_catalog_photos(self.product.id, [], self.employee.id, self.token)
        self.employee.waiter_role = "waiter"
        with self.assertRaises(AccessError):
            self._set([])
        self.employee.write({"waiter_role": "admin", "active": False})
        with self.assertRaises(AccessError):
            self._set([])

    # // Falla si un empleado de otra compañía administra la galería o se accede a fotos de una compañía no permitida.
    def test_gateway_and_record_rules_enforce_company(self):
        company = self.env["res.company"].create({"name": "Restaurante ajeno"})
        foreign = self.env["product.template"].sudo().create({"name": "Plato ajeno", "company_id": company.id})
        foreign_photo = self.env["projectapp.product.photo"].sudo().with_context(allowed_company_ids=[company.id]).create({
            "product_tmpl_id": foreign.id, "image": self.image,
        })
        with self.assertRaises(AccessError):
            self._set([], template_id=foreign.id)
        self.assertFalse(self.Photo.search([("id", "=", foreign_photo.id)]))
        with self.assertRaises(AccessError):
            foreign_photo.with_user(self.admin).with_context(allowed_company_ids=[self.env.company.id]).read(["image"])
        self.employee.company_id = company
        with self.assertRaises(AccessError):
            self._set([])
