// Glass text can change by up to four channel levels when Chromium recomposites
// the scrolling page. Keep the allowance below 1.6% of the 8-bit colour range.
const compareHeaderPixels = async (page, before, after, height) =>
  page.evaluate(
    async ({ images, width, height }) => {
      const pixels = async (data) => {
        const image = new Image();
        image.src = "data:image/png;base64," + data;
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      };
      const [first, second] = await Promise.all(images.map(pixels));
      let changedPixels = 0,
        maxChannelDelta = 0;
      for (let pixel = 0; pixel < first.length; pixel += 4) {
        let delta = 0;
        for (let channel = 0; channel < 4; channel++) {
          delta = Math.max(delta, Math.abs(first[pixel + channel] - second[pixel + channel]));
        }
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        if (delta > 4) {
          changedPixels++;
        }
      }
      return { changedPixels, maxChannelDelta };
    },
    {
      images: [before.toString("base64"), after.toString("base64")],
      width: page.viewportSize().width,
      height,
    },
  );

module.exports = { compareHeaderPixels };
