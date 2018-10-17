const emailConfig = require('../config/email-config')();
const mailgun = require('mailgun-js')(emailConfig);

const sendEmail = (recipient, message) => new Promise((resolve, reject) => {
  const data = {
    from: 'deividsanchez96@gmail.com',
    to: recipient,
    subject: message.subject,
    text: message.text,
  };

  mailgun.messages().send(data, (error) => {
    if (error) {
      return reject(error);
    }
    return resolve();
  });
});

exports.postEmail = async (req, res, next) => {
  const { recipient, message } = req.body;
  try {
    await sendEmail(recipient, message);
    res.json({ message: 'Mensaje enviado' });
    await next();
  } catch (e) {
    await next(e);
  }
};
