const { PrismaClient } = require('@prisma/client');

// Mencegah pembuatan instance Prisma baru setiap kali hot-reload di environment development.
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
