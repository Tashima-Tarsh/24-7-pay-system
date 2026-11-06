package com.sanbookpay.sdk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CheckoutUriTest {
    @Test
    fun acceptsExactPaise() {
        val uri = "upi://pay?pa=shop%40bank&pn=Store&am=500.29&cu=INR&tr=abc"
        assertEquals(uri, checkoutUri(uri, 50_029, "shop@bank", "abc"))
    }

    @Test
    fun rejectsAmountPayeeAndReferenceSubstitution() {
        val uri = "upi://pay?pa=shop%40bank&am=500.29&cu=INR&tr=abc"
        assertThrows(IllegalArgumentException::class.java) { checkoutUri(uri, 50_028, "shop@bank", "abc") }
        assertThrows(IllegalArgumentException::class.java) { checkoutUri(uri, 50_029, "other@bank", "abc") }
        assertThrows(IllegalArgumentException::class.java) { checkoutUri(uri, 50_029, "shop@bank", "def") }
    }

    @Test
    fun rejectsDuplicateFieldsAndOtherSchemes() {
        assertThrows(IllegalArgumentException::class.java) {
            checkoutUri("upi://pay?pa=shop%40bank&am=1&am=2&cu=INR&tr=abc", 100, "shop@bank", "abc")
        }
        assertThrows(IllegalArgumentException::class.java) {
            checkoutUri("https://pay?pa=shop%40bank&am=1&cu=INR&tr=abc", 100, "shop@bank", "abc")
        }
    }
}
