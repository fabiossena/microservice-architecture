# api-gateway

Ponto de entrada HTTP do laboratório. Além do dashboard de observabilidade, faz proxy reverso simples para as duas views.

- Dashboard: `http://localhost:8070/`
- Portal do cliente via gateway: `/user/`
- Central da operação via gateway: `/manage/`
- Health agregado: `GET /api/health`
- Filas via RabbitMQ Management: `GET /api/queues`
- Health próprio: `GET /health`

O proxy preserva streaming (SSE) das views. Em produção, este componente seria substituído ou complementado por um gateway com autenticação, rate limiting, TLS e roteamento declarativo (Kong, Envoy, YARP, Ocelot etc.).
