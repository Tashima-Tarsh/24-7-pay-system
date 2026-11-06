package com.sanbookpay.sdk

import java.net.URI
import java.net.URLDecoder

internal fun checkoutUri(value: String, amountPaise: Long, payee: String, reference: String): String {
    val uri = URI.create(value)
    require(uri.scheme == "upi" && uri.rawAuthority == "pay" && uri.rawPath.isEmpty() && uri.rawFragment == null) {
        "Invalid UPI payment URI"
    }
    val fields = mutableMapOf<String, String>()
    for (field in uri.rawQuery.orEmpty().split('&')) {
        val pair = field.split('=', limit = 2)
        require(pair.size == 2) { "Malformed UPI payment URI" }
        val name = URLDecoder.decode(pair[0], "UTF-8")
        val content = URLDecoder.decode(pair[1], "UTF-8")
        require(fields.put(name, content) == null) { "Duplicate UPI payment field" }
    }
    val amount = fields["am"].orEmpty()
    require(amount.matches(Regex("[0-9]+(?:\\.[0-9]{1,2})?"))) { "Invalid UPI payment amount" }
    require(amountPaise > 0 && amount.toBigDecimal().movePointRight(2).compareTo(amountPaise.toBigDecimal()) == 0) {
        "UPI payment amount differs from the server allocation"
    }
    require(fields["cu"] == "INR" && payee.isNotBlank() && fields["pa"] == payee &&
        reference.isNotBlank() && fields["tr"] == reference) { "UPI payment details differ from the server allocation" }
    return value
}
