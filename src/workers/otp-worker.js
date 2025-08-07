const amqp = require("amqplib/callback_api");
const nodeMailer = require("nodemailer");
const twilio = require("twilio");
require("dotenv").config();

const queueName = "otp-requests";

// Email transport setup
const transporter = nodeMailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Twilio client setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

amqp.connect(process.env.RABBITMQ_URL, (error, connection) => {
  if (error) throw error;

  connection.createChannel((err, channel) => {
    if (err) throw err;

    channel.assertQueue(queueName, { durable: true });

    console.info(
      "Waiting for messages in %s. To exit, press CTRL+C ",
      queueName
    );

    channel.consume(
      queueName,
      async (msg) => {
        const data = JSON.parse(msg.content.toString());
        console.info("Received messgae : ", data);

        const { contactMethod, contact, otp } = data;

        try {
          if (contactMethod === "email") {
            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: contact,
              subject: "Your One-Time Password (OTP)",
              text: `Your OTP is: ${otp}. It is valid for 5 minutes. Don't share it with anyone`,
            });
            console.info(`Email sent to ${contact}`);
          } else if (contactMethod === "phone") {
            await twilioClient.messages.create({
              body: `Your OTP is: ${otp}. It is v alid for 5 minute. Don't share it with anyone`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: contact,
            });
            console.log(`SMS sent to ${contact}`);
          }

          channel.ack(msg); //Acknowledge the message to remove it from the queue
        } catch (error) {
          console.error("Failed to send OTP", error);
        }
      },
      {
        noAck: false,
      }
    );
  });
});
