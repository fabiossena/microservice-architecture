# api-gateway

HTTP entry point for the lab. In addition to the observability dashboard, it reverse-proxies the two views.

- Dashboard: `http://localhost:8070/`
- Customer portal through the gateway: `/user/`
- Operations center through the gateway: `/manage/`
- Aggregated health: `GET /api/health`
- Queue data through RabbitMQ Management: `GET /api/queues`
- Own health: `GET /health`

The proxy preserves streaming (SSE) from the views. In production, this component would be replaced or complemented by a gateway with authentication, rate limiting, TLS, and declarative routing (Kong, Envoy, YARP, Ocelot, etc.).
