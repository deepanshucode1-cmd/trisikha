
// Mock of the logic used in app/api/webhooks/monitoring/route.ts
function getSecret(headers: Record<string, string>, searchParams: Record<string, string>) {
    const querySecret = searchParams["secret"];
    const authHeader = headers["authorization"] || headers["Authorization"];
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    return querySecret || bearerToken;
}

// Tests
console.log("Running verification...");

const test1 = getSecret({}, { secret: "foo" });
if (test1 !== "foo") console.error("Test 1 Failed: Query param only");
else console.log("Test 1 Passed");

const test2 = getSecret({ authorization: "Bearer bar" }, {});
if (test2 !== "bar") console.error("Test 2 Failed: Bearer header only");
else console.log("Test 2 Passed");

const test3 = getSecret({ Authorization: "Bearer baz" }, {});
if (test3 !== "baz") console.error("Test 3 Failed: Bearer header (Capitalized) only");
else console.log("Test 3 Passed");

const test4 = getSecret({ authorization: "Basic xyz" }, {});
if (test4 !== null) console.error("Test 4 Failed: Invalid header type");
else console.log("Test 4 Passed");

const test5 = getSecret({ authorization: "Bearer token" }, { secret: "query" });
if (test5 !== "query") console.error("Test 5 Failed: Query should take precedence (or check logic)");
else console.log("Test 5 Passed: Query takes precedence (as implemented)");

console.log("Verification complete.");
