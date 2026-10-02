# Caddy con el módulo DNS del proveedor (cloudflare, route53, digitalocean, godaddy…) para el certificado comodín.
ARG DNS_PROVIDER=cloudflare
FROM caddy:2-builder AS builder
ARG DNS_PROVIDER
RUN xcaddy build --with github.com/caddy-dns/${DNS_PROVIDER}
FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
