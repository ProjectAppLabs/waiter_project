"""Organización, restaurante y mesa resueltos en la base propia."""
from dataclasses import dataclass, field


class RestaurantNotFound(Exception):
    """La organización, el restaurante o la mesa no están disponibles."""


@dataclass(frozen=True)
class RestaurantContext:
    restaurant_slug: str
    restaurant_name: str
    venue_slug: str
    venue_name: str
    table_token: str | None
    table_number: int | None
    table_id: int | None
    brand: dict = field(default_factory=dict)
    restaurant_id: int | None = None

    @property
    def config_id(self):
        return self.restaurant_id

    @property
    def organization_slug(self):
        return self.restaurant_slug

    @property
    def organization_name(self):
        return self.restaurant_name
