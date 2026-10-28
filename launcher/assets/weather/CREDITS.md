# Weather wallpaper provenance and redistribution

All nine JPEGs in this directory are **AI-generated images made using OpenAI**,
contributed by **motorgrid-ita** for AeroTizen. They are synthetic landscape
illustrations in a photorealistic style, not photographs documenting real weather
or a verified real location. They are not Samsung-provided artwork.

## Individual asset register

| File | Source / provenance | Redistribution basis |
| --- | --- | --- |
| `cloud.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `fog.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `night.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `partly.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `rain.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `snow.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `storm.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `sun.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |
| `sunset.jpg` | AI-generated using OpenAI; contributed by motorgrid-ita | MIT, to the extent of contributor-held rights |

The contributor identifies these as the images generated for their AeroTizen Custom
reference implementation. Original repository source:
[`reference/v99256/launcher/assets/weather/`](https://github.com/motorgrid-ita/AeroTizen/tree/c9c34bf0b8478bf1c156b41c0568f475f008d272/launcher/assets/weather).
`MANIFEST.json` records each reference SHA-256 and optimized-file SHA-256.
The reference files were compared byte for byte before optimization.

Exact generation dates, model identifiers, prompts and generation IDs are not
recorded in this repository. The provenance statement is supplied by the
contributor; those missing details have not been reconstructed or invented.

## Permission and limits

The contributor submits these nine files under the repository's [MIT license](../../../LICENSE),
**to the extent that the contributor holds rights capable of being licensed**.
That permission includes use, copying, modification and redistribution, including
bundling in AeroTizen source and release packages, under that license. Preserve
this provenance notice and the MIT license when redistributing these assets.

This is **not a CC0 dedication**, a declaration that the images are public domain,
or a claim of exclusive copyright or guaranteed copyright eligibility in every
jurisdiction. It does not grant rights in third-party material, trademarks or
other users' outputs, and does not imply endorsement by OpenAI or Samsung.

OpenAI's [Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/)
(Content: Ownership of content and Similarity of content), reviewed 2026-10-27,
assign OpenAI's rights, if any, in output to the user to the extent permitted by
law. They also state that output need not be unique and that the user remains
responsible for the content. These terms are the service-side basis considered
here, **not a blanket OpenAI license for every generated image or a guarantee
against third-party claims**.

The [Sharing & publication policy](https://openai.com/policies/sharing-publication-policy/)
calls for review and disclosure of AI involvement. All nine scenes were visually
reviewed during this update; the settings control and this notice disclose that
they are AI-generated. No stock-photo or CC0 provenance is asserted.

## Packaging and performance

The reference images were recompressed with Pillow as 1920 x 1080 RGB baseline
JPEG, quality 82, optimized Huffman tables and 4:2:0 chroma subsampling. The scenes
and framing were retained; this is a lossy size optimization, not lossless copying.
No image-generation call was made to replace the original scenes.

The nine images total 2585658 bytes, down from 4089077 bytes.
JPEG avoids requiring modern image codecs on older TVs. Only the selected scene
is requested and decoded; there is no nine-image preload or crossfade.
