/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/email', 'N/record', "N/log", 'N/runtime', 'N/search', 'N/url', './crypto-js-3.1.9-1/crypto-js', './crypto-js-3.1.9-1/hmac-sha256'],
    (emailModule, record, log, runtime, search, url, crypto, hmacSha256) => {
        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        function onRequest(scriptContext) {
            if (scriptContext.request.method != "POST") {
                log.debug({
                    title: 'wrong request method',
                    details: scriptContext.request
                })
                return
            }
            var script = runtime.getCurrentScript();
            var sendToEmail = script.getParameter({
                name: 'custscript_email_receiver'
            });
            var wpSecret = script.getParameter({
                name: 'custscript_secret_wp'
            });
            var wpLocationID = script.getParameter({
                name: 'custscript_location_wordpress'
            });
            var wpSalesRep = script.getParameter({
                name: 'custscript_sales_rep_wordpress'
            });
            var wpDepartment = script.getParameter({
                name: 'custscript_department_wordpress'
            });
            var parsedBody = JSON.parse(scriptContext.request.body);

            log.debug({
                title: 'script request',
                details: scriptContext.request
            });
            try {
                var temp = hmacSha256(scriptContext.request.body, wpSecret);
                var result = crypto.enc.Base64.stringify(temp);
                var passedFlag = result == scriptContext.request.headers['X-WC-Webhook-Signature'];
            } catch (e) {
                log.error({
                    title: 'error signature',
                    details: e
                });
                var passedFlag = false;
            }


            if (!passedFlag) {
                log.error({
                    title: 'error signature',
                    details: `compare: ${test} => ${result} signature: ${scriptContext.request.headers['X-WC-Webhook-Signature']}`
                });
                return {
                    message: "invalid credentials",
                    body: "The request does not have the correct encryption."
                }
            }

            try {


                var wordpressID = parsedBody.id;
                var lineItems = parsedBody.line_items;
                var shippingMethod = parsedBody.shipping_lines;
                var metaData = parsedBody.meta_data;
                var vatNum = undefined;
                var billingMOL = undefined;
                for (let obj = 0; obj < metaData.length; obj++) {
                    if (metaData[obj].key == 'vat_num') {
                        vatNum = metaData[obj].value
                    }
                    if (metaData[obj].key == '_billing_mol') {
                        billingMOL = metaData[obj].value
                    }

                }

                var billingInfo;
                if (shippingMethod[0].method_title != 'Спиди') {

                    billingInfo = parsedBody.billing;
                } else {
                    billingInfo = parsedBody.shipping;
                }

                log.debug({
                    title: 'shipping method',
                    details: parsedBody.shipping_lines
                });
                log.debug({
                    title: 'billing info',
                    details: billingInfo
                });
                log.debug({
                    title: 'shipping info',
                    details: parsedBody.shipping
                });
                var name = billingInfo.first_name + ' ' + billingInfo.last_name;
                var email = parsedBody.billing.email;
                var phone = parsedBody.billing.phone;
                var company = billingInfo.company;
                var invoiceInfo = email;
                var address = `тел. ном.: ${phone}; Адрес: ${billingInfo.address_1} ; №: ${billingInfo.address_2} ;град: ${billingInfo.city} ;пощ. код: ${billingInfo.postcode}`;
                if (company != '') {
                    invoiceInfo += `
                компания: ${company} ; `
                };
                if (vatNum != undefined) {
                    invoiceInfo += `
                ДДС №: ${vatNum} ;`
                };
                if (billingMOL != undefined) {
                    invoiceInfo += `
                МОЛ: ${billingMOL} ;`
                };

                createSO();

            } catch (e) {
                log.error({
                    title: 'try to create a SO',
                    details: e
                });
                emailModule.send({
                    author: 8,
                    recipients: "innovations@aquatec-bg.com",
                    subject: 'Неуспешно създаване на SO от WordPress',
                    body: `WordPress ID: ${wordpressID}
                    Error: ${e}`,
                });
                return;
            }
            return {
                message: "success",
                body: "true"
            }

            function createSO() {
                var paymentType = {
                    'Вземане от магазина': '1',
                    'Спиди': '6',
                    'Econt Delivery': '5'
                };
                var paymentMethod = {
                    'Вземане от магазина': '1',
                    'Спиди': '13',
                    'Econt Delivery': '12'
                };
                var newSO = record.create({
                    type: record.Type.SALES_ORDER,
                    isDynamic: true,
                });
                setLineOnRecord(newSO, 'customform', '199');
                setLineOnRecord(newSO, 'entity', '4046');
                setLineOnRecord(newSO, 'custbody_aqt_customer_mol', name);
                setLineOnRecord(newSO, 'department', wpDepartment);
                setLineOnRecord(newSO, 'salesrep', wpSalesRep);
                setLineOnRecord(newSO, 'location', wpLocationID);
                setLineOnRecord(newSO, 'class', '1');
                setLineOnRecord(newSO, 'custbody_aqt_memo_longtext', address);
                setLineOnRecord(newSO, 'externalid', wordpressID);
                setLineOnRecord(newSO, 'custbody_aqt_created_by', '9708');
                setLineOnRecord(newSO, 'custbody_aqt_spa_specifics_remarks', invoiceInfo);
                setLineOnRecord(newSO, 'memo', shippingMethod[0].method_title);
                setLineOnRecord(newSO, 'custbody_aqt_payment_method', paymentType[shippingMethod[0].method_title]);
                setLineOnRecord(newSO, 'paymentmethod', paymentMethod[shippingMethod[0].method_title]);
                setLineOnRecord(newSO, 'custbody_warranty_print_pdf', "2");

                for (let i = 0; i < lineItems.length; i++) {
                    var itemSku = lineItems[i].sku;
                    var qty = lineItems[i].quantity;
                    var price = lineItems[i].price;

                    var searchItemID = search.create({
                        type: 'item',
                        columns: [{
                            name: 'internalid'
                        }],
                        filters: [{
                            name: 'itemid',
                            operator: 'is',
                            values: [itemSku]
                        }]
                    });

                    var resultID = searchItemID.run().getRange({
                        start: '0',
                        end: '5'
                    });

                    var itemID = resultID[0].getValue({
                        name: 'internalid'
                    });
                    //set item
                    newSO.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: itemID,
                        ignoreFieldChange: false
                    });
                    // set quantity
                    newSO.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: qty,
                        ignoreFieldChange: false

                    });
                    newSO.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        value: wpLocationID,
                        ignoreFieldChange: false

                    });

                    newSO.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'price',
                        value: -1,
                        ignoreFieldChange: false

                    });

                    newSO.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        value: Number(price) / 1.2,
                        ignoreFieldChange: false

                    });

                    newSO.commitLine({
                        sublistId: 'item'
                    })

                }
                newSO.save();
                var recordURL = url.resolveRecord({
                    recordType: 'salesorder',
                    recordId: newSO.id,
                    isEditMode: false
                });
                emailModule.send({
                    author: 8,
                    recipients: sendToEmail,
                    subject: 'Нова поръчка в Netsuite',
                    body: `нов Sales order: 
                    https://5237004.app.netsuite.com${recordURL}
                    <a href='https://5237004.app.netsuite.com${recordURL}'>линк към Sales Order-a</а>`,
                });
            }
            function setLineOnRecord(record, field, value) {
                try {
                    record.setValue({
                        fieldId: field,
                        value: value,
                        ignoreFieldChange: false
                    });
                } catch (e) {
                    log.error({
                        title: 'set field Value',
                        details: `field: ${field} ; value: ${value}`
                    });
                }
            }
        }

        return { onRequest }

    });
