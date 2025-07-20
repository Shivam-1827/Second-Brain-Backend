const amqp = require("amqplib");
const logger = require("../utils/logger");
const { tr } = require("zod/locales");

let connection;
let channel;

// queue name

const QUEUES = {
  TEXT_EXTRACTION: "text_extraction_queue",
  EMBEDDING_GENERATION: "embedding_generation_queue",
  DOCUMENT_ANALYSIS: "document_analysis_queue",
  NOTIFICATIONS: "notifications_queue",
  DEAD_LETTER: "dead_letter_queue",
};

// Exchange name
const EXCHANGES = {
  PROCESSING: "processing_exchange",
  NOTIFICATIONS: "notifications_exchange",
};

// Connect RABBITMQ
async function connectRabbitMQ() {
  try {
    const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";
    connection = await amqp.connect(url);

    connection.on("error", (err) => {
      logger.error("RabbitMQ connection error", err);
    });

    connection.on("close", () => {
      logger.info("RabbitMQ connection closed!");
    });

    channel = await connection.createChannel();

    // setting up excganges
    await channel.assertExchange(EXCHANGES.PROCESSING, "topic", {
      durable: true,
    });
    await channel.assertExchange(EXCHANGES.NOTIFICATIONS, "fanout", {
      durable: true,
    });

    // setting up queues
    await setupQueues();

    logger.info("RabbitMQ connected and configured!");
    return { connection, channel };
  } catch (error) {
    logger.error("Failed to connect to RabbitMQ: ", error);
    throw error;
  }
}

async function setupQueues() {
  try {
    // setting up dead letter queues
    await channel.assertQueue(QUEUES.DEAD_LETTER, {
      durable: true,
      arguments: {
        "x-message-ttl": 86400000, //24 hours
      },
    });

    // text extraction queue
    await channel.assertQueue(QUEUES.TEXT_EXTRACTION, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUES.DEAD_LETTER,
        "x-max-retries": 3,
      },
    });

    // Embedding generation queue
    await channel.assertQueue(QUEUES.EMBEDDING_GENERATION, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUES.DEAD_LETTER,
        "x-max-retries": 3,
      },
    });

    // Document analysis queue
    await channel.assertQueue(QUEUES.DOCUMENT_ANALYSIS, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": QUEUES.DEAD_LETTER,
        "x-max-retries": 3,
      },
    });

    // Notification queue
    await channel.assertQueue(QUEUES.NOTIFICATIONS, {
        durable: true
    });

    // Binding queue to the exchanges
    await channel.bindQueue(QUEUES.TEXT_EXTRACTION, EXCHANGES.PROCESSING, 'text.extraction');
    await channel.bindQueue(QUEUES.EMBEDDING_GENERATION, EXCHANGES.PROCESSING, 'embedding.generation');
    await channel.bindQueue(QUEUES.DOCUMENT_ANALYSIS, EXCHANGES.PROCESSING, 'document.analysis');
    await channel.bindQueue(QUEUES.NOTIFICATIONS, EXCHANGES.NOTIFICATIONS, '');

    logger.info('RabbitMQ queues configured successfully!');
  } catch (error) {
    logger.error('Queue setup failed: ', error);
    throw error;
  }
}

async function disconnectRabbitMQ(){
    try {
        if(channel){
            await channel.close();
        }

        if(connection){
            await connection.close();
        }

        logger.info('RabbitMQ disconnected successfully!');
    } catch (error) {
        logger.error('Error disconnecting RabbitMQ:', error);
    }
}

class MessagePublisher{
    static async publishTextExtractionJob(assetId, userId, filePath, fileType){
        const job = {
            id: `text_extraction_${assetId}`,
            assetId,
            userId,
            filePath,
            fileType,
            timestamp: new Date().toISOString(),
            attempts: 0
        };

        return await this.publishToQueue(QUEUES.TEXT_EXTRACTION, job);
    }

    static async publishEmbeddingGenerationJob(assetId, userId, extractedText){
        const job = {
            id: `embedding_generation_${assetId}`,
            assetId,
            userId,
            extractedText,
            timestamp: new Date().toISOString(),
            attempts: 0
        };

        return await this.publishToQueue(QUEUES.EMBEDDING_GENERATION, job);
    }

    static async publishDocumentAnalysisJob(userId, query, assetIds){
        const job = {
            id: `document_analysis_${userId}_${Date.now()}`,
            userId,
            query,
            assetIds,
            timestamp: new Date().toISOString(),
            attempts: 0
        };

        return await this.publishToQueue(QUEUES.DOCUMENT_ANALYSIS, job);
    }

    static async publishNotification(userId, type, message, data={}){
        const notification = {
            id: `notification_${userId}_${Date.now()}`,
            userId,
            type,
            message,
            data,
            timestamp: new Date().toISOString()
        };

        return await this.publishToExchange(EXCHANGES.NOTIFICATIONS, '', notification);
    }

    static async publishToQueue(queueName, message){
        try {
            const messageBuffer = Buffer.from(JSON.stringify(message));
            const sent = channel.sendToQueue(queueName, messageBuffer, {
                persistent: true,
                messageId: message.id,
                timestamp: Date.now()
            });

            if(sent){
                logger.info(`Message published to queue ${queueName}: `,message.id);
                return true;
            } else{
                logger.warn(`failed to publish message to queue ${queueName}: `, message.id);
                return false;
            }

        } catch (error) {
            logger.error(`Error publishing to queue ${queueName}:`, error);
            return false;
        }
    }


    static async publishToExchange(exchangeName, routingKey, message){
        try {
            const messageBuffer = Buffer.from(JSON.stringify(message));

            const sent = channel.publish(exchangeName, routingKey, messageBuffer, {
                persistent: true,
                messageId: message.id,
                timestamp: Date.now(),
            });

            if(sent){
                logger.info(`Message published to exchange ${exchangeName}: `, message.id);
                return true;
            } else{
                logger.warn(`Failed to publish message to exchange ${exchangeName}: `, message.id);
                return false;
            }
        } catch (error) {
            logger.error(`Error while publishing to the exchange ${exchangeName}:`, error);
            return false;
        }
    }
}

class MessageConsumer {
  static async consumeTextExtractionJobs(processingCallback) {
    return await this.consumeFromQueue(
      QUEUES.TEXT_EXTRACTION,
      processingCallback
    );
  }

  static async consumeEmbeddingGenerationJobs(processingCallback) {
    return await this.consumeFromQueue(
      QUEUES.EMBEDDING_GENERATION,
      processingCallback
    );
  }

  static async consumeDocumentAnalysisJobs(processingCallback) {
    return await this.consumeFromQueue(
      QUEUES.DOCUMENT_ANALYSIS,
      processingCallback
    );
  }

  static async consumeNotifications(processingCallback) {
    return await this.consumeFromQueue(
      QUEUES.NOTIFICATIONS,
      processingCallback
    );
  }

  static async consumeFromQueue(queueName, processingCallback){
    try {
        await channel.prefetch(1);    //process one message at a time
        const consumer = await channel.consume(queueName, async (message) => {
            if(message !== null){
                try {
                    const job = JSON.parse(message.content.toString());
                    logger.info(`Processing job from the queue ${queueName}: `, job.id);

                    const result = await processingCallback(job);

                    if(result.success){
                        channel.ack(message);
                        logger.info(`JOb processed successfully: `, job.id);
                    } else{
                        // Increment attempts and decide whether to retry or reject
                        job.attempts = (job.attempts || 0) + 1;

                        if(job.attempts < 3){
                            setTimeout(()=> {
                                channel.nack(message, false, true);
                            }, 5000 * job.attempts);   // exponential backoff
                            logger.warn(`Job failed, retrying(atempt ${job.attempts}):`, job.id);
                        } else{
                            // send to dead letter queue
                            channel.nack(message, false, false);
                            logger.error(`Job failed after max attempts: `, job.id);
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing job from from queue ${queueName}: `, error);
                    channel.nack(message, false, false);
                }
            }
        })
    } catch (error) {
        logger.error(`Error setting up consumer for  queue ${queueName}: `, error);
        throw error;
    }
  }
}

// Queue management utilities
class QueueManager {
    static async getQueueInfo(queueName){
        try {
            const queue = await channel.checkQueue(queueName);
            return {
                queue: queueName,
                messageCount: queue.messageCount,
                consumerCount: queue.consumerCount
            };
        } catch (error) {
            logger.error(`Error getting queue info for ${queueName}: `, error);
            return null;
        }
    }

    static async purgeQueue(queueName){
        try {
            await channel.purgeQueue(queueName);
            logger.info(`Queue purged: ${queueName}`);
            return true;
        } catch (error) {
            logger.error(`Error purging queue ${queueName}: `, error);
            return false;
        }
    }

    static async getAllQueuesInfo(){
        const queues = Object.values(QUEUES);
        const info = [];

        for(const queueName of queues){
            const queueInfo = await this.getQueueInfo(queueName);
            if(queueInfo){
                info.push(queueInfo);
            }
        }
        return info;
    }
}

module.exports = {
    connectRabbitMQ,
    disconnectRabbitMQ,
    MessagePublisher,
    MessageConsumer,
    QueueManager,
    QUEUES,
    EXCHANGES,
    getChannel: () => channel,
    getConnection: () => connection
};