#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditMedicalBill,
  generateNegotiationStrategy,
} from '../lib/billing/medicalBillAuditor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileArg = process.argv[2] || path.resolve(__dirname, '../data/seed/jordan-itemized-bill.txt');
const rawText = fs.readFileSync(fileArg, 'utf8');
const auditReport = auditMedicalBill(rawText, { locality: 'nyc' });
const strategy = generateNegotiationStrategy(auditReport);

console.log(JSON.stringify({ auditReport, strategy }, null, 2));
