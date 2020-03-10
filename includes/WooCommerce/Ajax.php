<?php
/**
 * @package WPbKash
 */
namespace Themepaw\bKash\WooCommerce;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

use Themepaw\bKash\Api\Query;

/**
 * Ajax class file.
 *
 * @package WpbKash
 */
final class Ajax {

	/**
	 * Store api class
	 */
	public $api;

	/**
	 * Initialize
	 */
	function __construct() {

		$option = get_option( 'wpbkash_settings_fields' );

		if ( empty( $option['app_key'] ) || empty( $option['app_secret'] ) || empty( $option['username'] ) || empty( $option['password'] ) ) {
			return false;
		}

		$this->api = new Query( $option );

		add_action( 'wp_ajax_wpbkash_createpayment', [ $this, 'wpbkash_createpayment' ] );
		add_action( 'wp_ajax_nopriv_wpbkash_createpayment', [ $this, 'wpbkash_createpayment' ] );
		add_action( 'wp_ajax_wpbkash_executepayment', [ $this, 'wpbkash_executepayment' ] );
		add_action( 'wp_ajax_nopriv_wpbkash_executepayment', [ $this, 'wpbkash_executepayment' ] );
	}

	/**
	 * bkash createpayment ajax request
	 */
	function wpbkash_createpayment() {

		check_ajax_referer( 'wpbkash_nonce', 'nonce' );

		$invoice  = ( isset( $_POST['invoice'] ) && ! empty( $_POST['invoice'] ) ) ? 'wc-order-id' . sanitize_key( $_POST['invoice'] ) : uniqid();
		$order_id = ( isset( $_POST['order_id'] ) && ! empty( $_POST['order_id'] ) ) ? absint( $_POST['order_id'] ) : '';

		$order = wc_get_order( $order_id );

		if ( ! is_object( $order ) ) {
			wp_send_json_error( __( 'Wrong or invalid order ID', 'wpbkash' ) );
			wp_die();
		}

		$amount = $order->get_total();

		$paymentData = $this->api->createPayment( $invoice, $amount, $order_id );

		echo $paymentData;

		wp_die();
	}

	/**
	 * bkash executepayment ajax request
	 */
	function wpbkash_executepayment() {
		check_ajax_referer( 'wpbkash_nonce', 'nonce' );

		$paymentid = ( isset( $_POST['paymentid'] ) && ! empty( $_POST['paymentid'] ) ) ? sanitize_text_field( $_POST['paymentid'] ) : '';
		$order_id  = ( isset( $_POST['order_id'] ) && ! empty( $_POST['order_id'] ) ) ? absint( $_POST['order_id'] ) : '';

		if ( empty( $paymentid ) ) {
			wp_send_json_error( __( 'Invalid token or expired', 'wpbkash' ) );
			wp_die();
		}

		$order = wc_get_order( $order_id );

		if ( ! is_object( $order ) ) {
			wp_send_json_error( __( 'Wrong or invalid order ID', 'wpbkash' ) );
			wp_die();
		}

		if ( is_user_logged_in() && get_current_user_id() !== $order->get_user_id() ) {
			wp_send_json_error(
				[
					'order_url' => $order->get_checkout_order_received_url(),
					'message'   => __(
						__( 'you don\'t have permission to continue', 'wpbkash' ),
						'wpbkash'
					)
				]
			);
			wp_die();
		}

		$data = $this->api->executePayment( $paymentid, $order_id );

		if ( ! isset( $data ) || empty( $data ) ) {
			wp_send_json_error(
				[
					'order_url' => $order->get_checkout_order_received_url(),
					'message'   => __(
						__( 'Something wen\'t wrong please try again.', 'wpbkash'),
						'wpbkash'
					)
				]
			);
			wp_die();
		}

		$data = json_decode( $data );

		if ( ! isset( $data->trxID ) || ! isset( $data->paymentID ) ) {
			wp_send_json_error(
				[
					'order_url' => $order->get_checkout_order_received_url(),
					'message'   => __(
						__( 'We are currently experiencing problems trying to connect to this payment gateway. Sorry for the inconvenience.', 'wpbkash' ),
						'wpbkash'
					)
				]
			);
			wp_die();
		}

		$customer_id    = $order->get_user_id();
		$data->user_id  = ( ! empty( $customer_id ) ) ? $customer_id : $order->get_billing_email();
		$data->order_id = $order_id;

		$order_url = apply_filters( 'wpbkash_wc_order_complete_redirect', $order->get_checkout_order_received_url() );

		$this->insert_transaction( $data );

		$order->add_order_note( sprintf( __( 'bKash payment completed with TrxID#%1$s! bKash amount: %2$s', 'wpbkash' ), $data->trxID, $data->amount ) );
		$order->payment_complete();

		wp_send_json_success(
			[
				'transactionStatus' => 'completed',
				'order_url'         => $order_url
			]
		);

		wp_die();

	}

	/**
	 * Insert entry transaction
	 *
	 * @param object $response
	 */
	function insert_transaction( $response ) {
		global $wpdb;

		$wpdb->insert(
			$wpdb->prefix . 'wpbkash',
			[
				'trx_id'     => sanitize_key( $response->trxID ),
				'trx_status' => sanitize_key( $response->transactionStatus ),
				'sender'     => sanitize_key( $response->user_id ),
				'ref'        => 'wc_order',
				'ref_id'     => sanitize_text_field( $response->order_id ),
				'amount'     => absint( $response->amount ),
				'created_at' => current_time( 'mysql' ),
				'status'     => 'completed',
				'data'       => maybe_serialize( $response )
			],
			[
				'%s',
				'%s',
				'%s',
				'%s',
				'%s',
				'%d',
				'%s',
				'%s',
				'%s'
			]
		);
	}

}

