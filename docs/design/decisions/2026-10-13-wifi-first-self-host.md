# Self-hosting starts on the centre Wi-Fi; the public name is Ruta

13 Oct 2026, #725, decided by the maintainer.

The self-host guide offers a Wi-Fi-only path first (phones open `http://<computer>.local:8080`, nothing reachable from outside, no domain) and the Cloudflare web address as a later step. Most centres need nothing more on day one, and it removes the domain and the hour of setup. User-facing docs say Ruta; the repository keeps its name. The README shows phone screenshots, because the phone is the product. Left out: local HTTPS on the Wi-Fi (a private certificate on every phone is too much for a centre); revisit if the app ever needs a secure context.
