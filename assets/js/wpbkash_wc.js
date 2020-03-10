jQuery(
    function ($) {

        const wpbkash = {
            bodyEl: $('body'),
            checkoutFormSelector: 'form.checkout',
            $checkoutFormSelector: $('form.checkout'),
            orderReview: 'form#order_review',
            trigger: '#bkash_trigger',
            onTrigger: '#bkash_on_trigger',
            jQueryUrl: 'https://code.jquery.com/jquery-3.4.1.min.js',

            // Order notes.
            orderNotesValue: '',
            orderNotesSelector: 'textarea#order_comments',
            orderNotesEl: $('textarea#order_comments'),

            // Payment method
            paymentMethodEl: $('input[name="payment_method"]:checked'),
            paymentMethod: '',
            selectAnotherSelector: '#paysoncheckout-select-other',

            // Address data.
            accessToken: '',
            scriptloaded: false,

            /*
             * Document ready function. 
             * Runs on the $(document).ready event.
             */
            documentReady: function () {
                wpbkash.getAmount();
            },

            /*
             * Window Load function. 
             * Runs on when window will be load
             */
            onLoad: function () {
                wpbkash.getAmount();
            },
            blockOnSubmit: function ($form) {
                var form_data = $form.data();

                if (1 !== form_data['blockUI.isBlocked']) {
                    $form.block({
                        message: null,
                        overlayCSS: {
                            background: '#fff',
                            opacity: 0.6
                        }
                    });
                }
            },
            handleUnloadEvent: function (e) {
                // Modern browsers have their own standard generic messages that they will display.
                // Confirm, alert, prompt or custom message are not allowed during the unload event
                // Browsers will display their own standard messages

                // Check if the browser is Internet Explorer
                if ((navigator.userAgent.indexOf('MSIE') !== -1) || (!!document.documentMode)) {
                    // IE handles unload events differently than modern browsers
                    e.preventDefault();
                    return undefined;
                }

                return true;
            },
            attachUnloadEventsOnSubmit: function () {
                $(window).on('beforeunload', this.handleUnloadEvent);
            },
            detachUnloadEventsOnSubmit: function () {
                $(window).unbind('beforeunload', wpbkash.handleUnloadEvent);
            },
            WooCommerceCheckoutInit: function () {

                var wc_checkout_form = $(wpbkash.checkoutFormSelector);

                wc_checkout_form.addClass('processing');

                wpbkash.blockOnSubmit(wc_checkout_form);

                // Attach event to block reloading the page when the form has been submitted
                wpbkash.attachUnloadEventsOnSubmit();

                $.ajax({
                    type: 'POST',
                    url: wc_checkout_params.checkout_url,
                    data: wc_checkout_form.serialize(),
                    dataType: 'json',
                    success: function (result) {
                        // Detach the unload handler that prevents a reload / redirect
                        wpbkash.detachUnloadEventsOnSubmit();

                        try {
                            if ('success' === result.result) {
                                if (result.redirect) {
                                    var order_id = result.redirect.match(/^.*\/(\d+)\/.*$/);
                                    order_id = order_id[1];
                                    wpbkash.wcbkashTrigger(parseInt(order_id), result.redirect);
                                }
                            } else if ('failure' === result.result) {
                                throw 'Result failure';
                            } else {
                                throw 'Invalid response';
                            }
                        } catch (err) {
                            // Reload page
                            if (true === result.reload) {
                                window.location.reload();
                                return;
                            }

                            // Trigger update in case we need a fresh nonce
                            if (true === result.refresh) {
                                $(document.body).trigger('update_checkout');
                            }

                            // Add new errors
                            if (result.messages) {
                                wpbkash.submit_error(result.messages);
                            } else {
                                wpbkash.submit_error('<div class="woocommerce-error">' + wc_checkout_params.i18n_checkout_error + '</div>'); // eslint-disable-line max-len
                            }
                        }
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        // Detach the unload handler that prevents a reload / redirect
                        wpbkash.detachUnloadEventsOnSubmit();

                        wpbkash.submit_error('<div class="woocommerce-error">' + errorThrown + '</div>');
                    }
                });
            },
            submit_error: function (error_message) {
                $('.woocommerce-NoticeGroup-checkout, .woocommerce-error, .woocommerce-message').remove();
                wpbkash.$checkoutFormSelector.prepend('<div class="woocommerce-NoticeGroup woocommerce-NoticeGroup-checkout">' + error_message + '</div>'); // eslint-disable-line max-len
                wpbkash.$checkoutFormSelector.removeClass('processing').unblock();
                wpbkash.$checkoutFormSelector.find('.input-text, select, input:checkbox').trigger('validate').blur();
                wpbkash.scroll_to_notices();
                $(document.body).trigger('checkout_error');
            },
            scroll_to_notices: function () {
                var scrollElement = $('.woocommerce-NoticeGroup-updateOrderReview, .woocommerce-NoticeGroup-checkout');

                if (!scrollElement.length) {
                    scrollElement = $('.form.checkout');
                }
                $.scroll_to_notices(scrollElement);
            },

            submit_error_review: function (error_message) {
                $('.woocommerce-notices-wrapper').remove();
                $(wpbkash.orderReview).prepend('<div class="woocommerce-notices-wrapper">' + error_message + '</div>'); // eslint-disable-line max-len
                $(wpbkash.orderReview).removeClass('processing').unblock();
                $(wpbkash.orderReview).find('.input-text, select, input:checkbox').trigger('validate').blur();
                wpbkash.scroll_to_notices_review();
                $(document.body).trigger('checkout_error');
            },
            scroll_to_notices_review: function () {
                var scrollElement = $('.woocommerce-notices-wrapper');

                if (!scrollElement.length) {
                    scrollElement = $(wpbkash.orderReview)
                }
                $.scroll_to_notices(scrollElement);
            },

            /*
             * Check if Payson is the selected gateway.
             */
            checkIfbKashSelected: function () {
                if ($(wpbkash.checkoutFormSelector).length && $('input[name="payment_method"]').val().length > 0) {
                    wpbkash.paymentMethod = $('input[name="payment_method"]:checked').val();
                    if ('wpbkash' === wpbkash.paymentMethod) {
                        return true;
                    }
                }
                return false;
            },

            wcbkashTrigger: function (order_id, redirect) {

                if (!wpbkash.checkIfbKashSelected()) {
                    return false;
                }

                if (!wpbkash.scriptloaded) {
                    $.when(
                        $.getScript(wpbkash_params.scriptUrl),
                        $.Deferred(
                            function (deferred) {
                                $(deferred.resolve);
                            }
                        )
                    ).done(
                        function () {
                            wpbkash.scriptloaded = true;
                            wpbkash.wcbkashInit(order_id, redirect);
                        }
                    );
                } else {
                    wpbkash.wcbkashInit(order_id, redirect);
                }

                return false;
            },

            orderReviewSubmit: function (e) {
                var $form = $(this);
                var method = $form.find('input[name="payment_method"]:checked').val();
                if ('wpbkash' === method) {

                    if ($form.is('.processing')) {
                        return false;
                    }

                    $form.addClass('processing');

                    var redirect = $form.find('input[name="_wp_http_referer"]').val().match(/^.*\/(\d+)\/.*$/),
                        order_id = redirect[1];

                    if (order_id.length) {
                        e.preventDefault();
                    }
                    if (!wpbkash.scriptloaded) {
                        $.when(
                            $.getScript(wpbkash_params.scriptUrl),
                            $.Deferred(
                                function (deferred) {
                                    $(deferred.resolve);
                                }
                            )
                        ).done(
                            function () {
                                wpbkash.scriptloaded = true;
                                wpbkash.wcOrderReviewInit(parseInt(order_id), redirect[0]);
                                return false;
                            }
                        );
                    } else {
                        wpbkash.wcOrderReviewInit(parseInt(order_id), redirect[0]);
                        return false;
                    }

                }
                return false;
            },

            wcOrderReviewInit: function ($self, redirect = '') {

                wpbkash.getTrigger($self);

                var paymentRequest,
                    paymentID;
                paymentRequest = {
                    amount: wpbkash.getAmount(),
                    intent: 'sale'
                };

                bKash.init({
                    paymentMode: 'checkout',
                    paymentRequest: paymentRequest,
                    createRequest: function (request) {
                        wpbkash.createPayment($self);
                    },
                    executeRequestOnAuthorization: function () {
                        wpbkash.executePayment($self);
                    },
                    onClose: function () {
                        // alert('User has clicked the close button');
                        if (redirect && redirect.length) {
                            window.location.href = redirect;
                        }

                        setTimeout( function() {
                            if( $('#bKashFrameWrapper').length ) {
                                $('#bKashFrameWrapper').remove();
                            }
                        }, 250 );
                    }
                });

                return false

            },
            onbkashTrigger: function (e) {
                e.preventDefault();

                var $self = $(this);

                $self.addClass('wpbkash_processing');

                if (!wpbkash.scriptloaded) {
                    $.when(
                        $.getScript(wpbkash.jQueryUrl),
                        $.getScript(wpbkash_params.scriptUrl),
                        $.Deferred(
                            function (deferred) {
                                $(deferred.resolve);
                            }
                        )
                    ).done(
                        function () {
                            wpbkash.scriptloaded = true;
                            wpbkash.wcbkashInit($self);
                        }
                    );
                } else {
                    wpbkash.wcbkashInit($self);
                }

                return false;
            },
            getAmount: function () {
                var price = '';

                if ($('.woocommerce-table--order-details').find('.woocommerce-Price-amount').length) {
                    price = $('.woocommerce-table--order-details').find('.woocommerce-Price-amount').last().html().match(/\d+(?:\.\d+)?/g);
                } else if ($('.woocommerce-checkout-review-order').find('.woocommerce-Price-amount').length) {
                    price = $('.woocommerce-checkout-review-order').find('.woocommerce-Price-amount').last().html().match(/\d+(?:\.\d+)?/g);
                } else if ($('#order_review').find('td.product-total').find('.woocommerce-Price-amount').length) {
                    price = $('#order_review').find('td.product-total').find('.woocommerce-Price-amount').last().html().match(/\d+(?:\.\d+)?/g);
                }

                if (typeof price === 'object') {
                    price = price[0];
                }

                return price;
            },
            wcbkashInit: function ($self, redirect = '') {

                wpbkash.getTrigger($self);

                var paymentRequest,
                    paymentID;
                paymentRequest = {
                    amount: wpbkash.getAmount(),
                    intent: 'sale'
                };

                bKash.init({
                    paymentMode: 'checkout',
                    paymentRequest: paymentRequest,
                    createRequest: function (request) {
                        wpbkash.createPayment($self);
                    },
                    executeRequestOnAuthorization: function () {
                        wpbkash.executePayment($self);
                    },
                    onClose: function () {
                        if( $self.length > 0 && $self.hasClass('wpbkash_processing') ) {
                            $self.removeClass('wpbkash_processing');
                        }
                        if (redirect && redirect.length) {
                            window.location.href = redirect;
                        }
                        if( $('#bKashFrameWrapper').length ) {
                            setTimeout( function() {                            
                                $('#bKashFrameWrapper').remove();
                            }, 250 );
                        }
                    }
                });

            },
            getOrderID: function ($param) {
                if (typeof $param === 'object') {
                    var get_id = $param.attr('data-id'),
                        order_id = '';

                    if (typeof get_id !== typeof undefined && get_id !== false) {
                        order_id = get_id;
                    }

                    return order_id;
                } else if (typeof $param === 'string') {
                    return string;
                } else if (typeof $param === 'number') {
                    return $param;
                }
            },
            createPayment: function ($param) {
                $.ajax({
                    url: wpbkash_params.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'wpbkash_createpayment',
                        order_id: wpbkash.getOrderID($param),
                        nonce: wpbkash_params.nonce
                    },
                    success: function (result) {
                        if( $(wpbkash.orderReview).length ) {
                            $(wpbkash.orderReview).removeClass('processing').unblock();
                        }
                        try {
                            if (result) {
                                var obj = JSON.parse(result);
                                if( obj.paymentID != null ) {
                                    paymentID = obj.paymentID;
                                    bKash.create().onSuccess(obj);
                                } else {
                                    throw 'Invalid response';
                                }
                            } else {
                                throw 'Failed response';
                            }
                        } catch (err) {
                            // Add new errors
                            if( $(wpbkash.orderReview).length ) {
                                wpbkash.submit_error_review('<div class="woocommerce-error">' + wpbkash_params.bkash_error + '</div>'); // eslint-disable-line max-len
                            }
                            if( $('#bKashFrameWrapper').length ) {
                                $('#bKashFrameWrapper').remove();
                            }
                        }
                    },
                    error: function () {
                        bKash.create().onError();
                    }
                });
            },
            executePayment: function ($param) {
                $.ajax({
                    url: wpbkash_params.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'wpbkash_executepayment',
                        paymentid: paymentID,
                        order_id: wpbkash.getOrderID($param),
                        nonce: wpbkash_params.nonce
                    },
                    success: function (result) {
                        if (result && true === result.success && result.data.transactionStatus != null && result.data.transactionStatus === 'completed') {
                            window.location.href = result.data.order_url;
                        } else if (result && result.error && result.data.order_url) {
                            window.location.href = result.data.order_url;
                            bKash.execute().onError();
                        } else {
                            window.location.reload();
                            bKash.execute().onError();
                        }
                    },
                    error: function () {
                        bKash.execute().onError();
                    }

                });
            },
            getTrigger: function ($param) {
                $('#bKash_button').removeAttr('disabled');
                setTimeout(
                    function () {
                        $('#bKash_button').trigger('click');
                    }, 1000
                )
            },

            formSubmit: function (e) {
                if (wpbkash.checkIfbKashSelected()) {
                    wpbkash.WooCommerceCheckoutInit();
                    return false;
                }
            },

            /*
             * Initiates the script and sets the triggers for the functions.
             */
            init: function () {
                $(document).ready(wpbkash.documentReady());
                $(window).on('load', wpbkash.onLoad());
                $(wpbkash.checkoutFormSelector).on('checkout_place_order_wpbkash', wpbkash.formSubmit);
                $(document).on('click', '#bkash_on_trigger', wpbkash.onbkashTrigger);
                $(wpbkash.orderReview).on('submit', wpbkash.orderReviewSubmit);
            },
        }
        wpbkash.init();

    }
);