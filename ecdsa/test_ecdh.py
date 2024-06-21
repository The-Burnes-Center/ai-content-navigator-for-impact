import os
import sys
import shutil
import subprocess
import pytest
from binascii import unhexlify

try:
    import unittest2 as unittest
except ImportError:
    import unittest

from .curves import (
    NIST192p,
    NIST224p,
    NIST256p,
    NIST384p,
    NIST521p,
    BRAINPOOLP160r1,
    SECP112r2,
    SECP128r1,
)
from .curves import curves
from .ecdh import (
    ECDH,
    InvalidCurveError,
    InvalidSharedSecretError,
    NoKeyError,
    NoCurveError,
)
from .keys import SigningKey, VerifyingKey
from .ellipticcurve import CurveEdTw


if "--fast" in sys.argv:  # pragma: no cover
    curves = [SECP112r2, SECP128r1]


@pytest.mark.parametrize(
    "vcurve",
    curves,
    ids=[curve.name for curve in curves],
)
def test_ecdh_each(vcurve):
    if isinstance(vcurve.curve, CurveEdTw):
        pytest.skip("ECDH is not supported for Edwards curves")
    ecdh1 = ECDH(curve=vcurve)
    ecdh2 = ECDH(curve=vcurve)

    ecdh2.generate_private_key()
    ecdh1.load_received_public_key(ecdh2.get_public_key())
    ecdh2.load_received_public_key(ecdh1.generate_private_key())

    secret1 = ecdh1.generate_sharedsecret_bytes()
    secret2 = ecdh2.generate_sharedsecret_bytes()
    assert secret1 == secret2


def test_ecdh_both_keys_present():
    key1 = SigningKey.generate(BRAINPOOLP160r1)
    key2 = SigningKey.generate(BRAINPOOLP160r1)

    ecdh1 = ECDH(BRAINPOOLP160r1, key1, key2.verifying_key)
    ecdh2 = ECDH(private_key=key2, public_key=key1.verifying_key)

    secret1 = ecdh1.generate_sharedsecret_bytes()
    secret2 = ecdh2.generate_sharedsecret_bytes()

    assert secret1 == secret2


def test_ecdh_no_public_key():
    ecdh1 = ECDH(curve=NIST192p)

    with pytest.raises(NoKeyError):
        ecdh1.generate_sharedsecret_bytes()

    ecdh1.generate_private_key()

    with pytest.raises(NoKeyError):
        ecdh1.generate_sharedsecret_bytes()


class TestECDH(unittest.TestCase):
    def test_load_key_from_wrong_curve(self):
        ecdh1 = ECDH()
        ecdh1.set_curve(NIST192p)

        key1 = SigningKey.generate(BRAINPOOLP160r1)

        with self.assertRaises(InvalidCurveError) as e:
            ecdh1.load_private_key(key1)

        self.assertIn("Curve mismatch", str(e.exception))

    def test_generate_without_curve(self):
        ecdh1 = ECDH()

        with self.assertRaises(NoCurveError) as e:
            ecdh1.generate_private_key()

        self.assertIn("Curve must be set", str(e.exception))

    def test_load_bytes_without_curve_set(self):
        ecdh1 = ECDH()

        with self.assertRaises(NoCurveError) as e:
            ecdh1.load_private_key_bytes(b"\x01" * 32)

        self.assertIn("Curve must be set", str(e.exception))

    def test_set_curve_from_received_public_key(self):
        ecdh1 = ECDH()

        key1 = SigningKey.generate(BRAINPOOLP160r1)

        ecdh1.load_received_public_key(key1.verifying_key)

        self.assertEqual(ecdh1.curve, BRAINPOOLP160r1)


def test_ecdh_wrong_public_key_curve():
    ecdh1 = ECDH(curve=NIST192p)
    ecdh1.generate_private_key()
    ecdh2 = ECDH(curve=NIST256p)
    ecdh2.generate_private_key()

    with pytest.raises(InvalidCurveError):
        ecdh1.load_received_public_key(ecdh2.get_public_key())

    with pytest.raises(InvalidCurveError):
        ecdh2.load_received_public_key(ecdh1.get_public_key())

    ecdh1.public_key = ecdh2.get_public_key()
    ecdh2.public_key = ecdh1.get_public_key()

    with pytest.raises(InvalidCurveError):
        ecdh1.generate_sharedsecret_bytes()

    with pytest.raises(InvalidCurveError):
        ecdh2.generate_sharedsecret_bytes()


def test_ecdh_invalid_shared_secret_curve():
    ecdh1 = ECDH(curve=NIST256p)
    ecdh1.generate_private_key()

    ecdh1.load_received_public_key(
        SigningKey.generate(NIST256p).get_verifying_key()
    )

    ecdh1.private_key.privkey.secret_multiplier = ecdh1.private_key.curve.order

    with pytest.raises(InvalidSharedSecretError):
        ecdh1.generate_sharedsecret_bytes()


# https://github.com/scogliani/ecc-test-vectors/blob/master/ecdh_kat/secp192r1.txt
# https://github.com/scogliani/ecc-test-vectors/blob/master/ecdh_kat/secp256r1.txt
# https://github.com/coruus/nist-testvectors/blob/master/csrc.nist.gov/groups/STM/cavp/documents/components/ecccdhtestvectors/KAS_ECC_CDH_PrimitiveTest.txt
@pytest.mark.parametrize(
    "curve,privatekey,pubkey,secret",
    [
        pytest.param(
            NIST192p,
            "f17d3fea367b74d340851ca4270dcb24c271f445bed9d527",
            "42ea6dd9969dd2a61fea1aac7f8e98edcc896c6e55857cc0"
            "dfbe5d7c61fac88b11811bde328e8a0d12bf01a9d204b523",
            "803d8ab2e5b6e6fca715737c3a82f7ce3c783124f6d51cd0",
            id="NIST192p-1",
        ),
        pytest.param(
            NIST192p,
            "56e853349d96fe4c442448dacb7cf92bb7a95dcf574a9bd5",
            "deb5712fa027ac8d2f22c455ccb73a91e17b6512b5e030e7"
            "7e2690a02cc9b28708431a29fb54b87b1f0c14e011ac2125",
            "c208847568b98835d7312cef1f97f7aa298283152313c29d",
            id="NIST192p-2",
        ),
        pytest.param(
            NIST192p,
            "c6ef61fe12e80bf56f2d3f7d0bb757394519906d55500949",
            "4edaa8efc5a0f40f843663ec5815e7762dddc008e663c20f"
            "0a9f8dc67a3e60ef6d64b522185d03df1fc0adfd42478279",
            "87229107047a3b611920d6e3b2c0c89bea4f49412260b8dd",
            id="NIST192p-3",
        ),
        pytest.param(
            NIST192p,
            "e6747b9c23ba7044f38ff7e62c35e4038920f5a0163d3cda",
            "8887c276edeed3e9e866b46d58d895c73fbd80b63e382e88"
            "04c5097ba6645e16206cfb70f7052655947dd44a17f1f9d5",
            "eec0bed8fc55e1feddc82158fd6dc0d48a4d796aaf47d46c",
            id="NIST192p-4",
        ),
        pytest.param(
            NIST192p,
            "beabedd0154a1afcfc85d52181c10f5eb47adc51f655047d",
            "0d045f30254adc1fcefa8a5b1f31bf4e739dd327cd18d594"
            "542c314e41427c08278a08ce8d7305f3b5b849c72d8aff73",
            "716e743b1b37a2cd8479f0a3d5a74c10ba2599be18d7e2f4",
            id="NIST192p-5",
        ),
        pytest.param(
            NIST192p,
            "cf70354226667321d6e2baf40999e2fd74c7a0f793fa8699",
            "fb35ca20d2e96665c51b98e8f6eb3d79113508d8bccd4516"
            "368eec0d5bfb847721df6aaff0e5d48c444f74bf9cd8a5a7",
            "f67053b934459985a315cb017bf0302891798d45d0e19508",
            id="NIST192p-6",
        ),
        pytest.param(
            NIST224p,
            "8346a60fc6f293ca5a0d2af68ba71d1dd389e5e40837942df3e43cbd",
            "af33cd0629bc7e996320a3f40368f74de8704fa37b8fab69abaae280"
            "882092ccbba7930f419a8a4f9bb16978bbc3838729992559a6f2e2d7",
            "7d96f9a3bd3c05cf5cc37feb8b9d5209d5c2597464dec3e9983743e8",
            id="NIST224p",
        ),
        pytest.param(
            NIST256p,
            "7d7dc5f71eb29ddaf80d6214632eeae03d9058af1fb6d22ed80badb62bc1a534",
            "700c48f77f56584c5cc632ca65640db91b6bacce3a4df6b42ce7cc838833d287"
            "db71e509e3fd9b060ddb20ba5c51dcc5948d46fbf640dfe0441782cab85fa4ac",
            "46fc62106420ff012e54a434fbdd2d25ccc5852060561e68040dd7778997bd7b",
            id="NIST256p-1",
        ),
        pytest.param(
            NIST256p,
            "38f65d6dce47676044d58ce5139582d568f64bb16098d179dbab07741dd5caf5",
            "809f04289c64348c01515eb03d5ce7ac1a8cb9498f5caa50197e58d43a86a7ae"
            "b29d84e811197f25eba8f5194092cb6ff440e26d4421011372461f579271cda3",
            "057d636096cb80b67a8c038c890e887d1adfa4195e9b3ce241c8a778c59cda67",
            id="NIST256p-2",
        ),
        pytest.param(
            NIST256p,
            "1accfaf1b97712b85a6f54b148985a1bdc4c9bec0bd258cad4b3d603f49f32c8",
            "a2339c12d4a03c33546de533268b4ad667debf458b464d77443636440ee7fec3"
            "ef48a3ab26e20220bcda2c1851076839dae88eae962869a497bf73cb66faf536",
            "2d457b78b4614132477618a5b077965ec90730a8c81a1c75d6d4ec68005d67ec",
            id="NIST256p-3",
        ),
        pytest.param(
            NIST256p,
            "207c43a79bfee03db6f4b944f53d2fb76cc49ef1c9c4d34d51b6c65c4db6932d",
            "df3989b9fa55495719b3cf46dccd28b5153f7808191dd518eff0c3cff2b705ed"
            "422294ff46003429d739a33206c8752552c8ba54a270defc06e221e0feaf6ac4",
            "96441259534b80f6aee3d287a6bb17b5094dd4277d9e294f8fe73e48bf2a0024",
            id="NIST256p-4",
        ),
        pytest.param(
            NIST256p,
            "59137e38152350b195c9718d39673d519838055ad908dd4757152fd8255c09bf",
            "41192d2813e79561e6a1d6f53c8bc1a433a199c835e141b05a74a97b0faeb922"
            "1af98cc45e98a7e041b01cf35f462b7562281351c8ebf3ffa02e33a0722a1328",
            "19d44c8d63e8e8dd12c22a87b8cd4ece27acdde04dbf47f7f27537a6999a8e62",
            id="NIST256p-5",
        ),
        pytest.param(
            NIST256p,
            "f5f8e0174610a661277979b58ce5c90fee6c9b3bb346a90a7196255e40b132ef",
            "33e82092a0f1fb38f5649d5867fba28b503172b7035574bf8e5b7100a3052792"
            "f2cf6b601e0a05945e335550bf648d782f46186c772c0f20d3cd0d6b8ca14b2f",
            "664e45d5bba4ac931cd65d52017e4be9b19a515f669bea4703542a2c525cd3d3",
            id="NIST256p-6",
        ),
        pytest.param(
            NIST384p,
            "3cc3122a68f0d95027ad38c067916ba0eb8c38894d22e1b1"
            "5618b6818a661774ad463b205da88cf699ab4d43c9cf98a1",
            "a7c76b970c3b5fe8b05d2838ae04ab47697b9eaf52e76459"
            "2efda27fe7513272734466b400091adbf2d68c58e0c50066"
            "ac68f19f2e1cb879aed43a9969b91a0839c4c38a49749b66"
            "1efedf243451915ed0905a32b060992b468c64766fc8437a",
            "5f9d29dc5e31a163060356213669c8ce132e22f57c9a04f4"
            "0ba7fcead493b457e5621e766c40a2e3d4d6a04b25e533f1",
            id="NIST384p",
        ),
        pytest.param(
            NIST521p,
            "017eecc07ab4b329068fba65e56a1f8890aa935e57134ae0ffcce802735151f4ea"
            "c6564f6ee9974c5e6887a1fefee5743ae2241bfeb95d5ce31ddcb6f9edb4d6fc47",
            "00685a48e86c79f0f0875f7bc18d25eb5fc8c0b07e5da4f4370f3a949034085433"
            "4b1e1b87fa395464c60626124a4e70d0f785601d37c09870ebf176666877a2046d"
            "01ba52c56fc8776d9e8f5db4f0cc27636d0b741bbe05400697942e80b739884a83"
            "bde99e0f6716939e632bc8986fa18dccd443a348b6c3e522497955a4f3c302f676",
            "005fc70477c3e63bc3954bd0df3ea0d1f41ee21746ed95fc5e1fdf90930d5e1366"
            "72d72cc770742d1711c3c3a4c334a0ad9759436a4d3c5bf6e74b9578fac148c831",
            id="NIST521p",
        ),
    ],
)
def test_ecdh_NIST(curve, privatekey, pubkey, secret):
    ecdh = ECDH(curve=curve)
    ecdh.load_private_key_bytes(unhexlify(privatekey))
    ecdh.load_received_public_key_bytes(unhexlify(pubkey))

    sharedsecret = ecdh.generate_sharedsecret_bytes()

    assert sharedsecret == unhexlify(secret)


pem_local_private_key = (
    "-----BEGIN EC PRIVATE KEY-----\n"
    "MF8CAQEEGF7IQgvW75JSqULpiQQ8op9WH6Uldw6xxaAKBggqhkjOPQMBAaE0AzIA\n"
    "BLiBd9CE7xf15FY5QIAoNg+fWbSk1yZOYtoGUdzkejWkxbRc9RWTQjqLVXucIJnz\n"
    "bA==\n"
    "-----END EC PRIVATE KEY-----\n"
)
der_local_private_key = (
    "305f02010104185ec8420bd6ef9252a942e989043ca29f561fa525770eb1c5a00a06082a864"
    "8ce3d030101a13403320004b88177d084ef17f5e45639408028360f9f59b4a4d7264e62da06"
    "51dce47a35a4c5b45cf51593423a8b557b9c2099f36c"
)
pem_remote_public_key = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MEkwEwYHKoZIzj0CAQYIKoZIzj0DAQEDMgAEuIF30ITvF/XkVjlAgCg2D59ZtKTX\n"
    "Jk5i2gZR3OR6NaTFtFz1FZNCOotVe5wgmfNs\n"
    "-----END PUBLIC KEY-----\n"
)
der_remote_public_key = (
    "3049301306072a8648ce3d020106082a8648ce3d03010103320004b88177d084ef17f5e4563"
    "9408028360f9f59b4a4d7264e62da0651dce47a35a4c5b45cf51593423a8b557b9c2099f36c"
)
gshared_secret = "8f457e34982478d1c34b9cd2d0c15911b72dd60d869e2cea"


def test_ecdh_pem():
    ecdh = ECDH()
    ecdh.load_private_key_pem(pem_local_private_key)
    ecdh.load_received_public_key_pem(pem_remote_public_key)

    sharedsecret = ecdh.generate_sharedsecret_bytes()

    assert sharedsecret == unhexlify(gshared_secret)


def test_ecdh_der():
    ecdh = ECDH()
    ecdh.load_private_key_der(unhexlify(der_local_private_key))
    ecdh.load_received_public_key_der(unhexlify(der_remote_public_key))

    sharedsecret = ecdh.generate_sharedsecret_bytes()

    assert sharedsecret == unhexlify(gshared_secret)


# Exception classes used by run_openssl.
class RunOpenSslError(Exception):
    pass


def run_openssl(cmd):
    OPENSSL = "openssl"
    p = subprocess.Popen(
        [OPENSSL] + cmd.split(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    stdout, ignored = p.communicate()
    if p.returncode != 0:
        raise RunOpenSslError(
            "cmd '%s %s' failed: rc=%s, stdout/err was %s"
            % (OPENSSL, cmd, p.returncode, stdout)
        )
    return stdout.decode()


OPENSSL_SUPPORTED_CURVES = set(
    c.split(":")[0].strip()
    for c in run_openssl("ecparam -list_curves").split("\n")
)


@pytest.mark.slow
@pytest.mark.parametrize(
    "vcurve",
    curves,
    ids=[curve.name for curve in curves],
)
def test_ecdh_with_openssl(vcurve):
    if isinstance(vcurve.curve, CurveEdTw):
        pytest.skip("Edwards curves are not supported for ECDH")

    assert vcurve.openssl_name

    if vcurve.openssl_name not in OPENSSL_SUPPORTED_CURVES:
        pytest.skip("system openssl does not support " + vcurve.openssl_name)

    try:
        hlp = run_openssl("pkeyutl -help")
        if hlp.find("-derive") == 0:  # pragma: no cover
            pytest.skip("system openssl does not support `pkeyutl -derive`")
    except RunOpenSslError:  # pragma: no cover
        pytest.skip("system openssl could not be executed")

    if os.path.isdir("t"):  # pragma: no branch
        shutil.rmtree("t")
    os.mkdir("t")
    run_openssl(
        "ecparam -name %s -genkey -out t/privkey1.pem" % vcurve.openssl_name
    )
    run_openssl(
        "ecparam -name %s -genkey -out t/privkey2.pem" % vcurve.openssl_name
    )
    run_openssl("ec -in t/privkey1.pem -pubout -out t/pubkey1.pem")

    ecdh1 = ECDH(curve=vcurve)
    ecdh2 = ECDH(curve=vcurve)
    with open("t/privkey1.pem") as e:
        key = e.read()
    ecdh1.load_private_key_pem(key)
    with open("t/privkey2.pem") as e:
        key = e.read()
    ecdh2.load_private_key_pem(key)

    with open("t/pubkey1.pem") as e:
        key = e.read()
    vk1 = VerifyingKey.from_pem(key)
    assert vk1.to_string() == ecdh1.get_public_key().to_string()
    vk2 = ecdh2.get_public_key()
    with open("t/pubkey2.pem", "wb") as e:
        e.write(vk2.to_pem())

    ecdh1.load_received_public_key(vk2)
    ecdh2.load_received_public_key(vk1)
    secret1 = ecdh1.generate_sharedsecret_bytes()
    secret2 = ecdh2.generate_sharedsecret_bytes()

    assert secret1 == secret2

    run_openssl(
        "pkeyutl -derive -inkey t/privkey1.pem -peerkey t/pubkey2.pem -out t/secret1"
    )
    run_openssl(
        "pkeyutl -derive -inkey t/privkey2.pem -peerkey t/pubkey1.pem -out t/secret2"
    )

    with open("t/secret1", "rb") as e:
        ssl_secret1 = e.read()
    with open("t/secret1", "rb") as e:
        ssl_secret2 = e.read()

    assert len(ssl_secret1) == vk1.curve.verifying_key_length // 2
    assert len(secret1) == vk1.curve.verifying_key_length // 2

    assert ssl_secret1 == ssl_secret2
    assert secret1 == ssl_secret1
