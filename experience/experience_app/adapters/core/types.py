"""Datos del sistema propio que consume el menú."""
from dataclasses import dataclass, field

PHOTO_SIZES = frozenset({"tarjeta", "plato"})
DEFAULT_PHOTO_SIZE = "tarjeta"
DEFAULT_SIGNUP_DISCOUNT = 5.0


@dataclass(frozen=True)
class Product:
    id: int
    name: str
    price: float
    category_ids: list[int]
    tax_ids: list[int]
    sold_out: bool = False
    template_id: int = 0
    description: str = ''
    favorite: bool = False
    has_image: bool = False
    image_version: str = ''
    image_origin: str = ''
    final_price: float | None = None
    attributes: dict = field(default_factory=dict)
    gallery: list[dict] = field(default_factory=list)

    def __post_init__(self):
        if self.final_price is None:
            object.__setattr__(self, 'final_price', self.price)


@dataclass(frozen=True)
class Category:
    id: int
    name: str
    sequence: int


@dataclass(frozen=True)
class Catalog:
    company_name: str
    products: list[Product] = field(default_factory=list)
    categories: list[Category] = field(default_factory=list)
    signup_discount_percent: float = DEFAULT_SIGNUP_DISCOUNT


@dataclass(frozen=True)
class CompanyBrand:
    """Marca de la organización para la carta pública."""

    name: str
    color: str
    font: str
    radius: int | None
    tagline: str
    greeting: str
    waiter_name: str
    welcome: str
    has_logo: bool
    version: str


@dataclass(frozen=True)
class OrderLine:
    uuid: str
    product_id: int
    name: str
    unit_price: float
    qty: float
    note: str
    tax_ids: list[int]
    discount: float = 0.0  # % sobre la línea, preservado entre reintentos.
    loyalty_card_id: int | None = None
    coupon_code: str = ''


@dataclass(frozen=True)
class PlacedOrder:
    id: int
    reference: str
    state: str
    total: float
    tax: float
    paid: float


@dataclass(frozen=True)
class OrderStatus:
    state: str  # draft | paid | done | invoiced | cancel
    kitchen: str  # none | cooking | ready | served
