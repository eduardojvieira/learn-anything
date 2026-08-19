#!/usr/bin/env node

import { main } from '../dist/learnctl/index.js';

process.exitCode = await main();
