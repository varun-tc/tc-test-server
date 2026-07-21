# tc-test-grpc-server

Self-hosted gRPC `HelloService` (unary `SayHello`, server-streaming `LotsOfReplies`,
client-streaming `LotsOfGreetings`, bidi `BidiHello`), replacing `grpcb.in` for the
TC Automation collection's gRPC tests. Verified locally with a real gRPC client
before deployment — see `server.js`.

Deployed as a **separate Render service** from the main `tc-test-server` — gRPC uses
HTTP/2 and needs its own dedicated port; it can't cleanly share a port with the main
service's Express/WebSocket (HTTP/1.1) server in the same Node process.

## Local development

```
npm install
PORT=9010 npm start
```

## Deploying to Render

Same pattern as the main service: New + → Blueprint → point at this repo, root dir
`grpc-server` (reads `render.yaml` here automatically), or manually: New + → Web
Service, Root Directory `grpc-server`, Build `npm install`, Start `npm start`.

**Important**: Render terminates TLS at its edge for all Web Services, including
gRPC ones — there is no way to expose a plaintext (non-TLS) gRPC port publicly on
Render's standard plan. So once deployed, gRPC clients connect to
`<service>.onrender.com:443` **with TLS enabled**. In the Thunder Client collection,
both gRPC requests should have `"tls": true` when pointed at this service (the old
`grpcb.in:9000` non-TLS variant doesn't have a real Render-hosted equivalent — only
the TLS one does).

After deploying, share the resulting URL back so the collection's two gRPC requests
can be repointed here instead of `grpcb.in`.
