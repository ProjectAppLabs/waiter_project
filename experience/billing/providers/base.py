"""Frontera del proveedor fiscal. Una respuesta simulada no acredita validación DIAN."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProviderResult:
    state: str
    provider_id: str = ""
    cufe: str = ""
    qr: str = ""
    xml: bytes = b""
    errors: list = field(default_factory=list)


class BillingProvider(ABC):
    @abstractmethod
    def issue(self, document) -> ProviderResult:
        """Reutiliza el identificador del documento en cada intento, incluso tras un error de red."""
