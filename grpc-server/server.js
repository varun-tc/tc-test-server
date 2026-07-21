// tc-test-grpc-server -- replaces grpcb.in for the TC Automation collection's
// gRPC tests. Implements HelloService.SayHello from hello.proto.
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.join(__dirname, "hello.proto");
const PORT = process.env.PORT || 9000;

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const helloProto = grpc.loadPackageDefinition(packageDefinition).hello;

function sayHello(call, callback) {
    const greeting = call.request.greeting || "noname";
    callback(null, { reply: `Hello, ${greeting}!` });
}

function lotsOfReplies(call) {
    const greeting = call.request.greeting || "noname";
    for (let i = 1; i <= 3; i++) {
        call.write({ reply: `Hello #${i}, ${greeting}!` });
    }
    call.end();
}

function lotsOfGreetings(call, callback) {
    const greetings = [];
    call.on("data", (req) => greetings.push(req.greeting || "noname"));
    call.on("end", () => callback(null, { reply: `Hello to all: ${greetings.join(", ")}!` }));
}

function bidiHello(call) {
    call.on("data", (req) => {
        call.write({ reply: `Hello, ${req.greeting || "noname"}!` });
    });
    call.on("end", () => call.end());
}

function main() {
    const server = new grpc.Server();
    server.addService(helloProto.HelloService.service, {
        SayHello: sayHello,
        LotsOfReplies: lotsOfReplies,
        LotsOfGreetings: lotsOfGreetings,
        BidiHello: bidiHello,
    });
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
        if (err) {
            console.error("Failed to bind gRPC server:", err);
            process.exit(1);
        }
        console.log(`tc-test-grpc-server listening on port ${boundPort}`);
    });
}

main();
