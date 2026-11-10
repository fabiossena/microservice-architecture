# catalog-service

Owner do catálogo e do estoque. Mantém reservas por pedido para permitir compensação (Saga por coreografia).

- Consome: `order.confirmed`, `order.cancelled`, `user.catalog.check`, `manager.catalog.restock`
- Publica: `catalog.reserved`, `catalog.rejected`, `catalog.checked`, `catalog.restocked`, `catalog.released`
- HTTP de apoio: `GET /health`, `GET /catalog`
- Seed: 5 produtos com estoque inicial; recriado apenas quando a tabela está vazia.

A reserva é atômica no SQLite e feita antes do pagamento, seguindo a ordem
`catálogo -> pagamento -> entrega`. No cancelamento, `order.cancelled` devolve o estoque.
