import { PrismaClient } from "./generated/prisma/client";

// Single shared instance. Creating a PrismaClient per request would open a new
// connection pool each time and exhaust the database's connection limit.
export const prisma = new PrismaClient();
