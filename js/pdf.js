(function (global) {
  "use strict";

  const encoder = new TextEncoder();

  function buildPdf(images, options) {
    const opts = options || {};
    const pageWidth = opts.pageWidth || 595.28;
    const pageHeight = opts.pageHeight || 841.89;
    const pageCount = images.length;
    const parts = [];
    let byteLength = 0;

    function push(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      parts.push(bytes);
      byteLength += bytes.length;
    }

    function beginObject(id) {
      offsets[id] = byteLength;
      push(`${id} 0 obj\n`);
    }

    function endObject() {
      push("\nendobj\n");
    }

    // IDs: 1 catalog, 2 pages, then 3 objects per page.
    const maxObjectId = 2 + pageCount * 3;
    const offsets = new Array(maxObjectId + 1).fill(0);
    const pageObjectIds = [];
    const contentObjectIds = [];
    const imageObjectIds = [];

    for (let i = 0; i < pageCount; i += 1) {
      const base = 3 + i * 3;
      pageObjectIds.push(base);
      contentObjectIds.push(base + 1);
      imageObjectIds.push(base + 2);
    }

    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    beginObject(1);
    push("<< /Type /Catalog /Pages 2 0 R >>");
    endObject();

    beginObject(2);
    push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);
    endObject();

    images.forEach((image, index) => {
      const pageId = pageObjectIds[index];
      const contentId = contentObjectIds[index];
      const imageId = imageObjectIds[index];
      const imgWidth = image.width || 1240;
      const imgHeight = image.height || 1754;

      beginObject(pageId);
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
          `/Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`
      );
      endObject();

      const content =
        `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
      beginObject(contentId);
      push(`<< /Length ${encoder.encode(content).length} >>\nstream\n`);
      push(content);
      push("endstream");
      endObject();

      beginObject(imageId);
      push(
        `<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Interpolate true /Length ${image.bytes.length} >>\nstream\n`
      );
      push(image.bytes);
      push("\nendstream");
      endObject();
    });

    const xrefOffset = byteLength;
    push(`xref\n0 ${maxObjectId + 1}\n`);
    push("0000000000 65535 f \n");
    for (let id = 1; id <= maxObjectId; id += 1) {
      const offset = String(offsets[id] || 0).padStart(10, "0");
      push(`${offset} 00000 n \n`);
    }
    push(
      `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`
    );

    return new Blob(parts, { type: "application/pdf" });
  }

  global.SimplePDF = { buildPdf };
})(window);