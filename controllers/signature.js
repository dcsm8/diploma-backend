// credits https://github.com/vbuch/node-signpdf/blob/master/src/signpdf.test.js
// credits https://stackoverflow.com/questions/15969733/verify-pkcs7-pem-signature-unpack-data-in-node-js/16148331#16148331
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const PDFDocument = require('pdfkit');

const DEFAULT_BYTE_RANGE_PLACEHOLDER = '**********';
const certPath = path.join(__dirname, '..', 'certs', 'certificate.p12');
const PKCS12_CERT_BAG = '1.2.840.113549.1.12.10.1.3';
const PKCS12_KEY_BAG = '1.2.840.113549.1.12.10.1.2';

const signedPDFFilePath = path.join(__dirname, '..', 'output', 'signed.pdf');

const addSignaturePlaceholder = ({ pdf, reason, signatureLength = 4096 }) => {
  /* eslint-disable no-underscore-dangle,no-param-reassign */
  // Generate the signature placeholder
  const signature = pdf.ref({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [
      0,
      DEFAULT_BYTE_RANGE_PLACEHOLDER,
      DEFAULT_BYTE_RANGE_PLACEHOLDER,
      DEFAULT_BYTE_RANGE_PLACEHOLDER,
    ],
    Contents: Buffer.from(String.fromCharCode(0).repeat(signatureLength)),
    Reason: new String(reason),
    M: new Date(),
  });

  // Generate signature annotation widget
  const widget = pdf.ref({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: [0, 0, 0, 0],
    V: signature,
    T: new String('Signature1'), // eslint-disable-line no-new-wrappers
    F: 4,
    P: pdf._root.data.Pages.data.Kids[0], // eslint-disable-line no-underscore-dangle
  });
  // Include the widget in a page
  pdf._root.data.Pages.data.Kids[0].data.Annots = [widget];

  // Create a form (with the widget) and link in the _root
  const form = pdf.ref({
    SigFlags: 3,
    Fields: [widget],
  });
  pdf._root.data.AcroForm = form;

  return {
    signature,
    form,
    widget,
  };
  /* eslint-enable no-underscore-dangle,no-param-reassign */
};

const createPDF = data => new Promise((resolve) => {
  const { date, student, program } = data;

  const doc = new PDFDocument({
    autoFirstPage: true,
    size: 'A4',
    layout: 'portrait',
    bufferPages: true,
  });

  doc.info = {
    Title: 'Certificado Facultad Tecnologica UDFJC',
    Author: 'author',
    Subject: data.invoiceId,
    CreationDate: new Date(),
    ModDate: new Date(),
  };

  doc.font('assets/oswald.ttf');

  doc.fillColor('black');
  doc.fontSize(22);

  doc.text('FACULTAD TECNOLÓGICA', {
    align: 'center',
  });

  doc.text('UNIVERSIDAD DISTRITAL FRANCISCO JOSÉ DE CALDAS', {
    align: 'center',
  });

  doc.fontSize(25);

  doc.text(
    'Certificado de Logro',
    {
      align: 'center',
    },
    200,
  );

  doc.text(
    student,
    {
      align: 'center',
    },
    300,
  );

  doc.text(
    program,
    {
      align: 'center',
    },
    400,
  );

  doc.text(
    date,
    {
      align: 'center',
    },
    500,
  );

  doc.text(
    'Este documento esta firmado digitalmente',
    {
      align: 'center',
    },
    600,
  );

  doc.image('assets/logo.png', (doc.page.width - 130) / 2, 650);

  const pdfChunks = [];
  doc.on('data', (data) => {
    pdfChunks.push(data);
  });
  doc.on('end', () => {
    resolve(Buffer.concat(pdfChunks));
  });

  const refs = addSignaturePlaceholder({
    pdf: doc,
    reason: 'I am the author',
    signatureLength: 4096,
  });

  Object.keys(refs).forEach(key => refs[key].end());

  doc.end();
});

const signPDF = (pdfBuffer, p12Buffer) => {
  if (!(pdfBuffer instanceof Buffer)) {
    throw new Error('PDF expected as Buffer.');
  }
  if (!(p12Buffer instanceof Buffer)) {
    throw new Error('p12 certificate expected as Buffer.');
  }

  let pdf = pdfBuffer;
  const lastChar = pdfBuffer.slice(pdfBuffer.length - 1).toString();
  if (lastChar === '\n') {
    // remove the trailing new line
    pdf = pdf.slice(0, pdf.length - 1);
  }

  const byteRangePlaceholder = [
    0,
    `/${DEFAULT_BYTE_RANGE_PLACEHOLDER}`,
    `/${DEFAULT_BYTE_RANGE_PLACEHOLDER}`,
    `/${DEFAULT_BYTE_RANGE_PLACEHOLDER}`,
  ];
  const byteRangeString = `/ByteRange [${byteRangePlaceholder.join(' ')}]`;
  const byteRangePos = pdf.indexOf(byteRangeString);
  if (byteRangePos === -1) {
    throw new Error(`Could not find ByteRange placeholder: ${byteRangeString}`);
  }
  const byteRangeEnd = byteRangePos + byteRangeString.length;
  const contentsTagPos = pdf.indexOf('/Contents ', byteRangeEnd);
  const placeholderPos = pdf.indexOf('<', contentsTagPos);
  const placeholderEnd = pdf.indexOf('>', placeholderPos);
  const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
  const placeholderLength = placeholderLengthWithBrackets - 2;
  const byteRange = [0, 0, 0, 0];
  byteRange[1] = placeholderPos;
  byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
  byteRange[3] = pdf.length - byteRange[2];
  let actualByteRange = `/ByteRange [${byteRange.join(' ')}]`;
  actualByteRange += ' '.repeat(byteRangeString.length - actualByteRange.length);

  // Replace the /ByteRange placeholder with the actual ByteRange
  pdf = Buffer.concat([
    pdf.slice(0, byteRangePos),
    Buffer.from(actualByteRange),
    pdf.slice(byteRangeEnd),
  ]);

  // Remove the placeholder signature
  pdf = Buffer.concat([
    pdf.slice(0, byteRange[1]),
    pdf.slice(byteRange[2], byteRange[2] + byteRange[3]),
  ]);

  const forgeCert = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(forgeCert);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, '');
  // get bags by type
  const certBags = p12.getBags({ bagType: PKCS12_CERT_BAG })[PKCS12_CERT_BAG];
  const keyBags = p12.getBags({ bagType: PKCS12_KEY_BAG })[PKCS12_KEY_BAG];

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(pdf.toString('binary'));
  p7.addCertificate(certBags[0].cert);

  p7.addSigner({
    key: keyBags[0].key,
    certificate: certBags[0].cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
        // value will be auto-populated at signing time
      },
      {
        type: forge.pki.oids.signingTime,
        // value can also be auto-populated at signing time
        value: new Date(),
      },
    ],
  });
  p7.sign({ detached: true });

  const raw = forge.asn1.toDer(p7.toAsn1()).getBytes();

  if (raw.length > placeholderLength) {
    throw new Error(`Signature exceeds placeholder length: ${raw.length} > ${placeholderLength}`);
  }

  let signature = Buffer.from(raw, 'binary').toString('hex');

  // placeholderLength is for the HEX symbols and we need the raw char length
  const placeholderCharCount = placeholderLength / 2;
  // Pad with zeroes so the output signature is the same length as the placeholder
  signature += Buffer.from(
    String.fromCharCode(0).repeat(placeholderCharCount - raw.length),
  ).toString('hex');

  pdf = Buffer.concat([
    pdf.slice(0, byteRange[1]),
    Buffer.from(`<${signature}>`),
    pdf.slice(byteRange[1]),
  ]);

  return pdf;
};

const signFunc = async (data) => {
  const pdfBuffer = await createPDF({
    invoiceId: 'asdasdjkayduweydwuedfhwu3dhweudhwd',
    ...data,
  });
  const signedPdf = signPDF(pdfBuffer, fs.readFileSync(certPath));

  return signedPdf;
};

const extractSignature = (pdf) => {
  const byteRangePos = pdf.indexOf('/ByteRange [');
  if (byteRangePos === -1) {
    throw new Error('Failed to locate ByteRange.');
  }

  const byteRangeEnd = pdf.indexOf(']', byteRangePos);
  if (byteRangeEnd === -1) {
    throw new Error('Failed to locate the end of the ByteRange.');
  }

  const byteRange = pdf.slice(byteRangePos, byteRangeEnd + 1).toString();
  const matches = /\/ByteRange \[(\d+) +(\d+) +(\d+) +(\d+)\]/.exec(byteRange);

  const signedData = Buffer.concat([
    pdf.slice(parseInt(matches[1]), parseInt(matches[1]) + parseInt(matches[2])),
    pdf.slice(parseInt(matches[3]), parseInt(matches[3]) + parseInt(matches[4])),
  ]);
  let signatureHex = pdf
    .slice(parseInt(matches[1]) + parseInt(matches[2]) + 1, parseInt(matches[3]) - 1)
    .toString('binary');
  signatureHex = signatureHex.replace(/(?:00)*$/, '');
  const signature = Buffer.from(signatureHex, 'hex').toString('binary');
  return { signature, signedData };
};

function verify(pdf) {
  return new Promise((resolve, reject) => {
    const extractedData = extractSignature(pdf);
    const p7Asn1 = forge.asn1.fromDer(extractedData.signature);
    const message = forge.pkcs7.messageFromAsn1(p7Asn1);
    const sig = message.rawCapture.signature;
    const attrs = message.rawCapture.authenticatedAttributes;
    const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
    const buf = Buffer.from(forge.asn1.toDer(set).data, 'binary');
    const cert = forge.pki.certificateToPem(message.certificates[0]);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(buf);
    const validAuthenticatedAttributes = verifier.verify(cert, sig, 'binary');
    if (!validAuthenticatedAttributes) {
      reject(new Error('Wrong authenticated attributes'));
    }
    const oids = forge.pki.oids;
    const hash = crypto.createHash('SHA256');
    const data = extractedData.signedData;
    hash.update(data);
    const fullAttrDigest = attrs.find(
      attr => forge.asn1.derToOid(attr.value[0].value) === oids.messageDigest,
    );
    const attrDigest = fullAttrDigest.value[1].value[0].value;
    const dataDigest = hash.digest();
    const validContentDigest = dataDigest.toString('binary') === attrDigest;
    if (!validContentDigest) {
      reject(new Error('Wrong content digest'));
    }
    resolve();
  });
}

// function to encode file data to base64 encoded string
function base64Encode(certificate) {
  // convert binary data to base64 encoded string
  return new Buffer(certificate).toString('base64');
}

// function to create file from base64 encoded string
function base64Decode(base64str) {
  return new Buffer.from(base64str, 'base64');
}

exports.postSignature = async (req, res, next) => {
  const { date, student, program } = req.body;
  try {
    const certificate = await signFunc({ date, student, program });
    const base64Certificate = base64Encode(certificate);
    res.json({
      message: 'Signature completed',
      document: base64Certificate,
      extension: 'pdf',
    });
  } catch (e) {
    await next(e);
  }
};

exports.postValidate = async (req, res, next) => {
  const { file } = req.body;
  const certificate = base64Decode(file);
  try {
    await verify(certificate);
    res.json({
      valid: true,
    });
  } catch (e) {
    res.json({
      valid: false,
    });
    await next(e);
  }
};
