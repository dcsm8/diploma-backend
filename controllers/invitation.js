const emailConfig = require('../config/email-config')();
const mailgun = require('mailgun-js')(emailConfig);

const sendEmail = (recipient, message, file, studentId) => new Promise((resolve, reject) => {
  const attachment = new mailgun.Attachment({ data: file, filename: `${studentId}.card` });

  const data = {
    from: 'deividsanchez96@gmail.com',
    to: recipient,
    subject: message.subject,
    text: message.text,
    attachment,
  };

  mailgun.messages().send(data, (error) => {
    if (error) {
      return reject(error);
    }
    return resolve();
  });
});

exports.postInvitation = async (req, res, next) => {
  const {
    recipient, message, card, studentId,
  } = req.body;
  const file = Buffer.from(card, 'base64');

  try {
    await sendEmail(recipient, message, file, studentId);
    res.json({ message: 'Mensaje enviado' });
  } catch (e) {
    await next(e);
  }
};
