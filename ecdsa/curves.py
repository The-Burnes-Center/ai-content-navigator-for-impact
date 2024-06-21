from __future__ import division

from six import PY2
from . import der, ecdsa, ellipticcurve, eddsa
from .util import orderlen, number_to_string, string_to_number
from ._compat import normalise_bytes, bit_length


# orderlen was defined in this module previously, so keep it in __all__,
# will need to mark it as deprecated later
__all__ = [
    "UnknownCurveError",
    "orderlen",
    "Curve",
    "SECP112r1",
    "SECP112r2",
    "SECP128r1",
    "SECP160r1",
    "NIST192p",
    "NIST224p",
    "NIST256p",
    "NIST384p",
    "NIST521p",
    "curves",
    "find_curve",
    "curve_by_name",
    "SECP256k1",
    "BRAINPOOLP160r1",
    "BRAINPOOLP160t1",
    "BRAINPOOLP192r1",
    "BRAINPOOLP192t1",
    "BRAINPOOLP224r1",
    "BRAINPOOLP224t1",
    "BRAINPOOLP256r1",
    "BRAINPOOLP256t1",
    "BRAINPOOLP320r1",
    "BRAINPOOLP320t1",
    "BRAINPOOLP384r1",
    "BRAINPOOLP384t1",
    "BRAINPOOLP512r1",
    "BRAINPOOLP512t1",
    "PRIME_FIELD_OID",
    "CHARACTERISTIC_TWO_FIELD_OID",
    "Ed25519",
    "Ed448",
]


PRIME_FIELD_OID = (1, 2, 840, 10045, 1, 1)
CHARACTERISTIC_TWO_FIELD_OID = (1, 2, 840, 10045, 1, 2)


class UnknownCurveError(Exception):
    pass


class Curve:
    def __init__(self, name, curve, generator, oid, openssl_name=None):
        self.name = name
        self.openssl_name = openssl_name  # maybe None
        self.curve = curve
        self.generator = generator
        self.order = generator.order()
        if isinstance(curve, ellipticcurve.CurveEdTw):
            # EdDSA keys are special in that both private and public
            # are the same size (as it's defined only with compressed points)

            # +1 for the sign bit and then round up
            self.baselen = (bit_length(curve.p()) + 1 + 7) // 8
            self.verifying_key_length = self.baselen
        else:
            self.baselen = orderlen(self.order)
            self.verifying_key_length = 2 * orderlen(curve.p())
        self.signature_length = 2 * self.baselen
        self.oid = oid
        if oid:
            self.encoded_oid = der.encode_oid(*oid)

    def __eq__(self, other):
        if isinstance(other, Curve):
            return (
                self.curve == other.curve and self.generator == other.generator
            )
        return NotImplemented

    def __ne__(self, other):
        return not self == other

    def __repr__(self):
        return self.name

    def to_der(self, encoding=None, point_encoding="uncompressed"):
        """Serialise the curve parameters to binary string.

        :param str encoding: the format to save the curve parameters in.
            Default is ``named_curve``, with fallback being the ``explicit``
            if the OID is not set for the curve.
        :param str point_encoding: the point encoding of the generator when
            explicit curve encoding is used. Ignored for ``named_curve``
            format.

        :return: DER encoded ECParameters structure
        :rtype: bytes
        """
        if encoding is None:
            if self.oid:
                encoding = "named_curve"
            else:
                encoding = "explicit"

        if encoding not in ("named_curve", "explicit"):
            raise ValueError(
                "Only 'named_curve' and 'explicit' encodings supported"
            )

        if encoding == "named_curve":
            if not self.oid:
                raise UnknownCurveError(
                    "Can't encode curve using named_curve encoding without "
                    "associated curve OID"
                )
            return der.encode_oid(*self.oid)
        elif isinstance(self.curve, ellipticcurve.CurveEdTw):
            assert encoding == "explicit"
            raise UnknownCurveError(
                "Twisted Edwards curves don't support explicit encoding"
            )

        # encode the ECParameters sequence
        curve_p = self.curve.p()
        version = der.encode_integer(1)
        field_id = der.encode_sequence(
            der.encode_oid(*PRIME_FIELD_OID), der.encode_integer(curve_p)
        )
        curve = der.encode_sequence(
            der.encode_octet_string(
                number_to_string(self.curve.a() % curve_p, curve_p)
            ),
            der.encode_octet_string(
                number_to_string(self.curve.b() % curve_p, curve_p)
            ),
        )
        base = der.encode_octet_string(self.generator.to_bytes(point_encoding))
        order = der.encode_integer(self.generator.order())
        seq_elements = [version, field_id, curve, base, order]
        if self.curve.cofactor():
            cofactor = der.encode_integer(self.curve.cofactor())
            seq_elements.append(cofactor)

        return der.encode_sequence(*seq_elements)

    def to_pem(self, encoding=None, point_encoding="uncompressed"):
        """
        Serialise the curve parameters to the :term:`PEM` format.

        :param str encoding: the format to save the curve parameters in.
            Default is ``named_curve``, with fallback being the ``explicit``
            if the OID is not set for the curve.
        :param str point_encoding: the point encoding of the generator when
            explicit curve encoding is used. Ignored for ``named_curve``
            format.

        :return: PEM encoded ECParameters structure
        :rtype: str
        """
        return der.topem(
            self.to_der(encoding, point_encoding), "EC PARAMETERS"
        )

    @staticmethod
    def from_der(data, valid_encodings=None):
        """Decode the curve parameters from DER file.

        :param data: the binary string to decode the parameters from
        :type data: :term:`bytes-like object`
        :param valid_encodings: set of names of allowed encodings, by default
            all (set by passing ``None``), supported ones are ``named_curve``
            and ``explicit``
        :type valid_encodings: :term:`set-like object`
        """
        if not valid_encodings:
            valid_encodings = set(("named_curve", "explicit"))
        if not all(i in ["named_curve", "explicit"] for i in valid_encodings):
            raise ValueError(
                "Only named_curve and explicit encodings supported"
            )
        data = normalise_bytes(data)
        if not der.is_sequence(data):
            if "named_curve" not in valid_encodings:
                raise der.UnexpectedDER(
                    "named_curve curve parameters not allowed"
                )
            oid, empty = der.remove_object(data)
            if empty:
                raise der.UnexpectedDER("Unexpected data after OID")
            return find_curve(oid)

        if "explicit" not in valid_encodings:
            raise der.UnexpectedDER("explicit curve parameters not allowed")

        seq, empty = der.remove_sequence(data)
        if empty:
            raise der.UnexpectedDER(
                "Unexpected data after ECParameters structure"
            )
        # decode the ECParameters sequence
        version, rest = der.remove_integer(seq)
        if version != 1:
            raise der.UnexpectedDER("Unknown parameter encoding format")
        field_id, rest = der.remove_sequence(rest)
        curve, rest = der.remove_sequence(rest)
        base_bytes, rest = der.remove_octet_string(rest)
        order, rest = der.remove_integer(rest)
        cofactor = None
        if rest:
            # the ASN.1 specification of ECParameters allows for future
            # extensions of the sequence, so ignore the remaining bytes
            cofactor, _ = der.remove_integer(rest)

        # decode the ECParameters.fieldID sequence
        field_type, rest = der.remove_object(field_id)
        if field_type == CHARACTERISTIC_TWO_FIELD_OID:
            raise UnknownCurveError("Characteristic 2 curves unsupported")
        if field_type != PRIME_FIELD_OID:
            raise UnknownCurveError(
                "Unknown field type: {0}".format(field_type)
            )
        prime, empty = der.remove_integer(rest)
        if empty:
            raise der.UnexpectedDER(
                "Unexpected data after ECParameters.fieldID.Prime-p element"
            )

        # decode the ECParameters.curve sequence
        curve_a_bytes, rest = der.remove_octet_string(curve)
        curve_b_bytes, rest = der.remove_octet_string(rest)
        # seed can be defined here, but we don't parse it, so ignore `rest`

        curve_a = string_to_number(curve_a_bytes)
        curve_b = string_to_number(curve_b_bytes)

        curve_fp = ellipticcurve.CurveFp(prime, curve_a, curve_b, cofactor)

        # decode the ECParameters.base point

        base = ellipticcurve.PointJacobi.from_bytes(
            curve_fp,
            base_bytes,
            valid_encodings=("uncompressed", "compressed", "hybrid"),
            order=order,
            generator=True,
        )
        tmp_curve = Curve("unknown", curve_fp, base, None)

        # if the curve matches one of the well-known ones, use the well-known
        # one in preference, as it will have the OID and name associated
        for i in curves:
            if tmp_curve == i:
                return i
        return tmp_curve

    @classmethod
    def from_pem(cls, string, valid_encodings=None):
        """Decode the curve parameters from PEM file.

        :param str string: the text string to decode the parameters from
        :param valid_encodings: set of names of allowed encodings, by default
            all (set by passing ``None``), supported ones are ``named_curve``
            and ``explicit``
        :type valid_encodings: :term:`set-like object`
        """
        if not PY2 and isinstance(string, str):  # pragma: no branch
            string = string.encode()

        ec_param_index = string.find(b"-----BEGIN EC PARAMETERS-----")
        if ec_param_index == -1:
            raise der.UnexpectedDER("EC PARAMETERS PEM header not found")

        return cls.from_der(
            der.unpem(string[ec_param_index:]), valid_encodings
        )


# the SEC curves
SECP112r1 = Curve(
    "SECP112r1",
    ecdsa.curve_112r1,
    ecdsa.generator_112r1,
    (1, 3, 132, 0, 6),
    "secp112r1",
)


SECP112r2 = Curve(
    "SECP112r2",
    ecdsa.curve_112r2,
    ecdsa.generator_112r2,
    (1, 3, 132, 0, 7),
    "secp112r2",
)


SECP128r1 = Curve(
    "SECP128r1",
    ecdsa.curve_128r1,
    ecdsa.generator_128r1,
    (1, 3, 132, 0, 28),
    "secp128r1",
)


SECP160r1 = Curve(
    "SECP160r1",
    ecdsa.curve_160r1,
    ecdsa.generator_160r1,
    (1, 3, 132, 0, 8),
    "secp160r1",
)


# the NIST curves
NIST192p = Curve(
    "NIST192p",
    ecdsa.curve_192,
    ecdsa.generator_192,
    (1, 2, 840, 10045, 3, 1, 1),
    "prime192v1",
)


NIST224p = Curve(
    "NIST224p",
    ecdsa.curve_224,
    ecdsa.generator_224,
    (1, 3, 132, 0, 33),
    "secp224r1",
)


NIST256p = Curve(
    "NIST256p",
    ecdsa.curve_256,
    ecdsa.generator_256,
    (1, 2, 840, 10045, 3, 1, 7),
    "prime256v1",
)


NIST384p = Curve(
    "NIST384p",
    ecdsa.curve_384,
    ecdsa.generator_384,
    (1, 3, 132, 0, 34),
    "secp384r1",
)


NIST521p = Curve(
    "NIST521p",
    ecdsa.curve_521,
    ecdsa.generator_521,
    (1, 3, 132, 0, 35),
    "secp521r1",
)


SECP256k1 = Curve(
    "SECP256k1",
    ecdsa.curve_secp256k1,
    ecdsa.generator_secp256k1,
    (1, 3, 132, 0, 10),
    "secp256k1",
)


BRAINPOOLP160r1 = Curve(
    "BRAINPOOLP160r1",
    ecdsa.curve_brainpoolp160r1,
    ecdsa.generator_brainpoolp160r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 1),
    "brainpoolP160r1",
)


BRAINPOOLP160t1 = Curve(
    "BRAINPOOLP160t1",
    ecdsa.curve_brainpoolp160t1,
    ecdsa.generator_brainpoolp160t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 2),
    "brainpoolP160t1",
)


BRAINPOOLP192r1 = Curve(
    "BRAINPOOLP192r1",
    ecdsa.curve_brainpoolp192r1,
    ecdsa.generator_brainpoolp192r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 3),
    "brainpoolP192r1",
)


BRAINPOOLP192t1 = Curve(
    "BRAINPOOLP192t1",
    ecdsa.curve_brainpoolp192t1,
    ecdsa.generator_brainpoolp192t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 4),
    "brainpoolP192t1",
)


BRAINPOOLP224r1 = Curve(
    "BRAINPOOLP224r1",
    ecdsa.curve_brainpoolp224r1,
    ecdsa.generator_brainpoolp224r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 5),
    "brainpoolP224r1",
)


BRAINPOOLP224t1 = Curve(
    "BRAINPOOLP224t1",
    ecdsa.curve_brainpoolp224t1,
    ecdsa.generator_brainpoolp224t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 6),
    "brainpoolP224t1",
)


BRAINPOOLP256r1 = Curve(
    "BRAINPOOLP256r1",
    ecdsa.curve_brainpoolp256r1,
    ecdsa.generator_brainpoolp256r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 7),
    "brainpoolP256r1",
)


BRAINPOOLP256t1 = Curve(
    "BRAINPOOLP256t1",
    ecdsa.curve_brainpoolp256t1,
    ecdsa.generator_brainpoolp256t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 8),
    "brainpoolP256t1",
)


BRAINPOOLP320r1 = Curve(
    "BRAINPOOLP320r1",
    ecdsa.curve_brainpoolp320r1,
    ecdsa.generator_brainpoolp320r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 9),
    "brainpoolP320r1",
)


BRAINPOOLP320t1 = Curve(
    "BRAINPOOLP320t1",
    ecdsa.curve_brainpoolp320t1,
    ecdsa.generator_brainpoolp320t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 10),
    "brainpoolP320t1",
)


BRAINPOOLP384r1 = Curve(
    "BRAINPOOLP384r1",
    ecdsa.curve_brainpoolp384r1,
    ecdsa.generator_brainpoolp384r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 11),
    "brainpoolP384r1",
)


BRAINPOOLP384t1 = Curve(
    "BRAINPOOLP384t1",
    ecdsa.curve_brainpoolp384t1,
    ecdsa.generator_brainpoolp384t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 12),
    "brainpoolP384t1",
)


BRAINPOOLP512r1 = Curve(
    "BRAINPOOLP512r1",
    ecdsa.curve_brainpoolp512r1,
    ecdsa.generator_brainpoolp512r1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 13),
    "brainpoolP512r1",
)


BRAINPOOLP512t1 = Curve(
    "BRAINPOOLP512t1",
    ecdsa.curve_brainpoolp512t1,
    ecdsa.generator_brainpoolp512t1,
    (1, 3, 36, 3, 3, 2, 8, 1, 1, 14),
    "brainpoolP512t1",
)


Ed25519 = Curve(
    "Ed25519",
    eddsa.curve_ed25519,
    eddsa.generator_ed25519,
    (1, 3, 101, 112),
)


Ed448 = Curve(
    "Ed448",
    eddsa.curve_ed448,
    eddsa.generator_ed448,
    (1, 3, 101, 113),
)


# no order in particular, but keep previously added curves first
curves = [
    NIST192p,
    NIST224p,
    NIST256p,
    NIST384p,
    NIST521p,
    SECP256k1,
    BRAINPOOLP160r1,
    BRAINPOOLP192r1,
    BRAINPOOLP224r1,
    BRAINPOOLP256r1,
    BRAINPOOLP320r1,
    BRAINPOOLP384r1,
    BRAINPOOLP512r1,
    SECP112r1,
    SECP112r2,
    SECP128r1,
    SECP160r1,
    Ed25519,
    Ed448,
    BRAINPOOLP160t1,
    BRAINPOOLP192t1,
    BRAINPOOLP224t1,
    BRAINPOOLP256t1,
    BRAINPOOLP320t1,
    BRAINPOOLP384t1,
    BRAINPOOLP512t1,
]


def find_curve(oid_curve):
    """Select a curve based on its OID

    :param tuple[int,...] oid_curve: ASN.1 Object Identifier of the
        curve to return, like ``(1, 2, 840, 10045, 3, 1, 7)`` for ``NIST256p``.

    :raises UnknownCurveError: When the oid doesn't match any of the supported
        curves

    :rtype: ~ecdsa.curves.Curve
    """
    for c in curves:
        if c.oid == oid_curve:
            return c
    raise UnknownCurveError(
        "I don't know about the curve with oid %s."
        "I only know about these: %s" % (oid_curve, [c.name for c in curves])
    )


def curve_by_name(name):
    """Select a curve based on its name.

    Returns a :py:class:`~ecdsa.curves.Curve` object with a ``name`` name.
    Note that ``name`` is case-sensitve.

    :param str name: Name of the curve to return, like ``NIST256p`` or
        ``prime256v1``

    :raises UnknownCurveError: When the name doesn't match any of the supported
        curves

    :rtype: ~ecdsa.curves.Curve
    """
    for c in curves:
        if name == c.name or (c.openssl_name and name == c.openssl_name):
            return c
    raise UnknownCurveError(
        "Curve with name {0!r} unknown, only curves supported: {1}".format(
            name, [c.name for c in curves]
        )
    )
