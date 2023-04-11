/**
 * @NApiVersion 2.x
 * @NModuleScope SameAccount
 */
function testRequestWithKey(body,secretKey){
    var cryptoJS=require("./crypto-js-3.1.9-1/crypto-js")
    var hmacSha256 = require("./crypto-js-3.1.9-1/hmac-sha256");
   var encryptedBody = hmacSha256('dani','q+=7j{}0ornck&NT1=2i%{YSc!=boS#ZTn1t^AJ$@paIsJW!7{');
   console.log(encryptedBody);
console.log(cryptoJS.enc.Base64.stringify(encryptedBody));
}
