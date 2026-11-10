# catalog-service

Owner of the catalog and stock. It keeps per-order reservations to support compensation (choreographed saga).

- Consumes: `order.confirmed`, `order.cancelled`, `user.catalog.check`, `manager.catalog.restock`
- Publishes: `catalog.reserved`, `catalog.rejected`, `catalog.checked`, `catalog.restocked`, `catalog.released`
- Support HTTP: `GET /health`, `GET /catalog`
- Seed: five products with initial stock; recreated only when the table is empty.

The reservation is atomic in SQLite and happens before payment, following the order
`catalog -> payment -> delivery`. On cancellation, `order.cancelled` returns the stock.
