const content1 = "Subject: Hello World\nThis is the body";
const content2 = "Subject:Hello World\nThis is the body";
const content3 = "Subject: Hello World\r\nThis is the body";
const content4 = "This is the body without subject";

function clean(content) {
  return content.replace(/^Subject:\s*.*\n?/mi, '').trim();
}

console.log("Test 1:", clean(content1) === "This is the body" ? "PASS" : "FAIL (" + clean(content1) + ")");
console.log("Test 2:", clean(content2) === "This is the body" ? "PASS" : "FAIL (" + clean(content2) + ")");
console.log("Test 3:", clean(content3) === "This is the body" ? "PASS" : "FAIL (" + clean(content3) + ")");
console.log("Test 4:", clean(content4) === "This is the body without subject" ? "PASS" : "FAIL (" + clean(content4) + ")");
