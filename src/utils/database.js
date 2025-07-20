const  {PrismaClient} = require('@prisma/client');
const logger = require('./logger');

class DatabaseManager {
    constructor(){
        this.prisma = new PrismaClient({
            datasources: {
                    db: {
                        url: process.env.DATABASE_URL,
                    },
            },
            log: [
                { level: 'query', emit: 'event' },
                {level: 'error', emit: 'event'},
                {level: 'warn', emit: 'event'},
            ],
        });

        // setting up the logging for the database queries
        this.setupLogging();
    }

    setupLogging(){
        this.prisma.$on('query', (e) => {
            logger.debug(`Query: ${e.query}`);
            logger.debug(`Duration: ${e.duration}ms`);
        });

        this.prisma.$on('error', (e) => {
            logger.error(`Database error: ${e.message}`);
        });

        this.prisma.$on('warn', (e) => {
            logger.warn(`Database warning: ${e.message}`);
        });
    }

    async connect(){
        try {
            await this.prisma.$connect();
            logger.info('Database connected successfully! ');
        } catch (error) {
            logger.error('Database connection failed: ', error);
            throw error;
        }
    }

    async disconnect(){
        try {
            await this.prisma.$disconnect();
            logger.info('Database disconnected successfully');
        } catch (error) {
            logger.error('Database disconnection failed: ', error);
            throw error;
        }
    }

    async healthCheckup(){
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return {status: 'healthy', timestamp: new Date() };
        } catch (error) {
            logger.error('Database health checkup failed: ', error);
            throw error;
        }
    }

    // Transaction helper
    async transaction(callback){
        try {
            return await this.prisma.$transaction(callback);
        } catch (error) {
            logger.error('Transaction failed: ', error);
            throw error;
        }
    }

    // Pagination helper
    getPaginationOptions(page=1, limit=10){
        const skip = (page - 1) * limit;
        return {
            skip,
            take: limit,
        };
    }

    // Search helper with full text search
    buildSearchQuery(searchTerm, fields=[]){
        if(!searchTerm || fields.length == 0) return {};
        
        const orConditions = fields.map(field => ({
            [field]: {
                contains: searchTerm,
                mode: 'insensitive'
            },
        }));
    }

    // Date range helper
    buildDateRangeQuery(startDate, endDate, field='created_at'){
        const dateQuery = {};

        if(startDate){
            dateQuery.gte = new Date(startDate);
        }

        if(endDate){
            dateQuery.lte = new Date(endDate);
        }

        return Object.keys(dateQuery).length > 0 ? {[field]: dateQuery} : {};
    }

    // cleanup old records
    async cleanupOldRecords(model, days=30, dateField='created_at'){
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        try {
            const result = await this.prisma[model].deleteMany({
                where: {
                    [dateField]: {
                        lt: cutoffDate,
                    },
                },
            });

            logger.info(`Cleaned up ${result.count} old records from ${model}`);
            return result;
        } catch (error) {
            logger.error(`Cleanup failed for model: ${model}`, error);
            throw error;
        }
    }

    getInstance(){
        return this.prisma;
    }

}

const databaseManager = new DatabaseManager();

module.exports = databaseManager;