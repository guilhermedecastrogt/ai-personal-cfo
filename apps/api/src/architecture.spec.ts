import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    const isProductionSource =
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.fixture.ts');
    return isProductionSource
      ? [{ path: relative(SOURCE_ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

function importsOf(file: SourceFile): string[] {
  return [...file.text.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
}

function offenders(
  files: readonly SourceFile[],
  isOffence: (file: SourceFile) => boolean,
): string[] {
  return files.filter(isOffence).map((file) => file.path);
}

describe('architecture', () => {
  const files = sourceFiles(SOURCE_ROOT);
  const within = (...folders: string[]): SourceFile[] =>
    files.filter((file) => folders.some((folder) => file.path.startsWith(folder)));

  it('imports the OpenAI SDK only inside the OpenAI provider', () => {
    const outsideProvider = files.filter((file) => !file.path.startsWith('ai/openai/'));

    expect(
      offenders(outsideProvider, (file) =>
        importsOf(file).some((name) => /^openai(\/|$)/.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the finance engine and money handling independent of AI, media and persistence', () => {
    const forbidden =
      /(^|\/)(ai|media|conversation|database)\/|^openai|^drizzle-orm|^pg$|^@nestjs\//;

    expect(
      offenders(within('finance/domain/', 'money/'), (file) =>
        importsOf(file).some((name) => forbidden.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the financial domain modules independent of AI and media', () => {
    const domain = within(
      'accounts/',
      'budgets/',
      'categories/',
      'goals/',
      'households/',
      'transactions/',
      'finance/',
    );

    expect(
      offenders(domain, (file) =>
        importsOf(file).some((name) => /(^|\/)(ai|media|conversation|whatsapp)\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('lets the conversation layer reach data only through application services', () => {
    const conversation = within('conversation/');
    const ownRepository = './conversations.repository.js';

    expect(
      offenders(conversation, (file) =>
        importsOf(file).some((name) => name.endsWith('.repository.js') && name !== ownRepository),
      ),
    ).toEqual([]);
    expect(
      offenders(conversation, (file) =>
        importsOf(file).some((name) => /drizzle-orm|^pg$/.test(name)),
      ).sort(),
    ).toEqual(['conversation/conversations.repository.ts', 'conversation/conversations.schema.ts']);
  });

  it('does no financial arithmetic in conversation code', () => {
    const arithmetic =
      /money-math|sumMinor|multiplyThenDivide|divideRounded|Minor\s*[-+*/]\s*\w|\w\s*[-+*/]\s*\w+Minor/;

    expect(offenders(within('conversation/'), (file) => arithmetic.test(file.text))).toEqual([]);
  });

  it('never gives the model earlier assistant replies', () => {
    const provider = files.find((file) => file.path === 'ai/ai-provider.ts');
    const repository = files.find(
      (file) => file.path === 'conversation/conversations.repository.ts',
    );
    const adapter = files.find((file) => file.path === 'ai/openai/openai-provider.ts');

    expect(provider?.text).toContain('readonly recentUserMessages: readonly string[];');
    expect(provider?.text).not.toMatch(/history|ConversationTurn\[\]/);
    expect(repository?.text).toContain("eq(aiMessages.role, 'USER')");
    expect(adapter?.text).not.toContain("'assistant'");
  });

  it('keeps conversation state free of figures and identifiers', () => {
    const state = files.find((file) => file.path === 'conversation/conversation-state.ts');

    expect(state?.text).not.toMatch(/Minor|BasisPoints|householdId|memberId|accountId|uuid/);
  });

  it('resolves the household from the request context before any financial operation', () => {
    const assistant = files.find(
      (file) => file.path === 'conversation/financial-assistant.service.ts',
    );
    const queries = files.find(
      (file) => file.path === 'conversation/queries/financial-query.service.ts',
    );

    expect(assistant?.text).toContain('this.finance.currentDate(context.householdId, instant)');
    expect(assistant?.text).not.toMatch(
      /householdId:\s*(interpretation|question|frame|candidate|state)\./,
    );
    expect(queries?.text).toContain('this.directories.load(context.householdId)');
    expect(queries?.text).not.toMatch(/householdId:\s*(frame|filters|resolution)\./);
  });

  it('serves the dashboard through application services, never repositories', () => {
    const dashboard = within('dashboard/');

    expect(dashboard.length).toBeGreaterThan(3);
    expect(
      offenders(dashboard, (file) =>
        importsOf(file).some((name) => /\.repository\.js|\.schema\.js|drizzle-orm|^pg$/.test(name)),
      ),
    ).toEqual([]);
  });

  it('does no financial calculation in the dashboard API or the session layer', () => {
    const arithmetic =
      /money-math|sumMinor|multiplyThenDivide|divideRounded|Minor\s*[-+*/]\s*\w|\w\s*[-+*/]\s*\w+Minor/;

    expect(offenders(within('dashboard/', 'auth/'), (file) => arithmetic.test(file.text))).toEqual(
      [],
    );
  });

  it('guards every dashboard route and takes the household only from the session', () => {
    const controller = files.find((file) => file.path === 'dashboard/dashboard.controller.ts');
    const routes = controller?.text.match(/@(Get|Post)\(/g) ?? [];
    const contexts = controller?.text.match(/@CurrentContext\(\) context: RequestContext/g) ?? [];

    expect(controller?.text).toContain('@UseGuards(RateLimitGuard, SessionGuard)');
    expect(routes.length).toBeGreaterThan(8);
    expect(contexts).toHaveLength(routes.length);
    expect(
      offenders(within('dashboard/'), (file) =>
        /householdId:\s*(query|filters|parsed)\./.test(file.text),
      ),
    ).toEqual([]);
    expect(controller?.text).not.toMatch(/householdId|household_id/);
  });

  it('takes the review from the CFO service and figures from the finance service', () => {
    const service = files.find((file) => file.path === 'dashboard/dashboard.service.ts');

    expect(service?.text).toContain('this.cfo.monthlyReview(');
    expect(service?.text).toContain('this.cfo.monthlyAnalysis(');
    expect(service?.text).not.toMatch(/explainMonthlyReview|AI_PROVIDER|buildMonthlyReview\(/);
  });

  it('stores sessions and access codes only as hashes', () => {
    const service = files.find((file) => file.path === 'auth/auth.service.ts');
    const schema = files.find((file) => file.path === 'auth/auth.schema.ts');

    expect(service?.text).toContain("createHash('sha256')");
    expect(schema?.text).toMatch(/code_hash/);
    expect(schema?.text).toMatch(/token_hash/);
    expect(schema?.text).not.toMatch(/'token'|'code'|'password'/);
  });

  it('gives the AI layer no access to repositories, services or the finance engine', () => {
    const reachesData = /\.repository\.js|\.service\.js|\/finance\/|\/cfo\/|\/conversation\//;

    expect(
      offenders(within('ai/'), (file) => importsOf(file).some((name) => reachesData.test(name))),
    ).toEqual([]);
  });

  it('builds the review from the finance engine, with no persistence or AI in the analysis', () => {
    const forbidden = /drizzle-orm|^pg$|\/database\/|\.repository\.js|\/ai\/|^openai/;

    expect(
      offenders(within('cfo/analysis/', 'cfo/context/'), (file) =>
        importsOf(file)
          .filter((name) => !name.endsWith('/ai/ai-provider.js'))
          .some((name) => forbidden.test(name)),
      ),
    ).toEqual([]);
  });

  it('reads financial data for the review only through the finance service', () => {
    const readsLedger =
      /ledger\.repository|transactions\.repository|transactions\.schema|budgets\.repository/;

    expect(
      offenders(within('cfo/'), (file) => importsOf(file).some((name) => readsLedger.test(name))),
    ).toEqual([]);
  });

  it('performs no money arithmetic in the review context or explanation', () => {
    const arithmetic =
      /money-math|sumMinor|multiplyThenDivide|divideRounded|Minor\s*[-+*/]|[-+*/]\s*\w+Minor/;

    expect(
      offenders(within('cfo/context/', 'cfo/explanation/', 'ai/'), (file) =>
        arithmetic.test(file.text),
      ),
    ).toEqual([]);
  });

  it('scopes every review to the household of the request context', () => {
    const service = files.find((file) => file.path === 'cfo/cfo.service.ts');

    expect(service?.text).toContain('const { householdId } = context;');
    expect(service?.text).not.toMatch(/householdId:\s*(request|month|review)\./);
  });

  it('gives the AI and media layers no access to the database', () => {
    expect(
      offenders(within('ai/', 'media/'), (file) =>
        importsOf(file).some((name) => /drizzle-orm|^pg$|\/database\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('reaches the network only through the OpenAI provider and the Kapso adapter', () => {
    const networkAccess =
      /\bfetch\(|^import (?!type)[^;]*'node:(https?|net|tls|dgram)'|\bXMLHttpRequest\b/m;
    const elsewhere = files.filter(
      (file) => !file.path.startsWith('ai/openai/') && !file.path.startsWith('whatsapp/kapso/'),
    );

    expect(offenders(elsewhere, (file) => networkAccess.test(file.text))).toEqual([]);
  });

  it('keeps Kapso-specific code inside the Kapso adapter', () => {
    const outsideAdapter = files.filter(
      (file) => !file.path.startsWith('whatsapp/kapso/') && file.path !== 'app.module.ts',
    );

    expect(
      offenders(outsideAdapter, (file) => importsOf(file).some((name) => /kapso/i.test(name))),
    ).toEqual([]);
    expect(
      offenders(
        files.filter(
          (file) =>
            !file.path.startsWith('whatsapp/kapso/') &&
            !file.path.startsWith('config/') &&
            !file.path.startsWith('database/seed/') &&
            file.path !== 'app.module.ts',
        ),
        (file) => /kapso/i.test(file.text),
      ),
    ).toEqual([]);
  });

  it('keeps the application independent of the messaging provider and the messaging layer', () => {
    const application = within(
      'ai/',
      'conversation/',
      'media/',
      'finance/',
      'money/',
      'transactions/',
    );

    expect(
      offenders(application, (file) =>
        importsOf(file).some((name) => /(^|\/)whatsapp\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the finance engine, the finance domain and the review free of notifications', () => {
    const financial = within(
      'finance/',
      'money/',
      'cfo/',
      'transactions/',
      'budgets/',
      'goals/',
      'accounts/',
      'categories/',
    );

    expect(financial.length).toBeGreaterThan(30);
    expect(
      offenders(financial, (file) =>
        importsOf(file).some((name) => /proactive|notification|(^|\/)whatsapp\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the notification policy pure, with no persistence, AI or delivery', () => {
    const policy = files.find((file) => file.path === 'proactive/proactive-policy.ts');
    const candidates = files.find((file) => file.path === 'proactive/proactive-candidates.ts');

    expect(importsOf(policy ?? { path: '', text: '' })).toEqual([
      '../finance/domain/insights/insight-engine.js',
    ]);
    for (const file of [policy, candidates]) {
      expect(file?.text).not.toMatch(
        /drizzle-orm|\.repository\.js|\.schema\.js|@nestjs|AI_PROVIDER|ai-provider|notification-channel|new Date\(\)|Date\.now|Math\.random/,
      );
    }
  });

  it('decides what to send without the model, and never lets the composer decide', () => {
    const service = files.find((file) => file.path === 'proactive/proactive-cfo.service.ts');
    const composer = files.find((file) => file.path === 'proactive/notification-composer.ts');

    expect(service?.text).toContain('decideNotification(');
    expect(service?.text).toContain('deliveryHold(');
    expect(service?.text).not.toMatch(/AI_PROVIDER|ai-provider|composeReply|\/ai\//);
    expect(composer?.text).toContain('findUnverifiedFigures(');
    expect(composer?.text).not.toMatch(
      /\.repository\.js|notification-channel|decideNotification|deliveryHold|drizzle-orm|severity\s*=/,
    );
    expect(
      offenders(
        within('proactive/'),
        (file) =>
          file.path !== 'proactive/notification-composer.ts' &&
          importsOf(file).some((name) => /\/ai\/(?!ai\.module)/.test(name)),
      ),
    ).toEqual([]);
  });

  it('gives the AI layer no way to send, store or decide notifications', () => {
    expect(
      offenders(within('ai/'), (file) =>
        importsOf(file).some((name) => /proactive|notification|whatsapp|households/.test(name)),
      ),
    ).toEqual([]);
  });

  it('delivers notifications only through the channel abstraction', () => {
    const proactive = within('proactive/').filter(
      (file) => file.path !== 'proactive/proactive.module.ts',
    );
    const adapter = files.find((file) => file.path === 'whatsapp/whatsapp-notification-channel.ts');

    expect(proactive.length).toBeGreaterThan(6);
    expect(
      offenders(
        proactive,
        (file) =>
          importsOf(file).some((name) => /whatsapp/i.test(name)) ||
          /sendText|WHATSAPP_PROVIDER/.test(file.text),
      ),
    ).toEqual([]);
    expect(adapter?.text).toContain('@Inject(WHATSAPP_PROVIDER)');
    expect(adapter?.text).toContain('this.provider.sendText(');
    expect(adapter?.text).toContain('listWhatsAppAddresses(');
    expect(
      offenders(
        files,
        (file) => file.text.includes('.sendText(') && !file.path.startsWith('whatsapp/'),
      ),
    ).toEqual([]);
  });

  it('does no financial calculation in the notification layer', () => {
    const arithmetic =
      /money-math|sumMinor|multiplyThenDivide|divideRounded|Minor\s*[-+*/]\s*\w|\w\s*[-+*/]\s*\w+Minor/;
    const notification = [
      ...within('proactive/'),
      ...files.filter((file) => file.path === 'whatsapp/whatsapp-notification-channel.ts'),
    ];

    expect(offenders(notification, (file) => arithmetic.test(file.text))).toEqual([]);
  });

  it('scopes every notification query to a household and claims by unique key', () => {
    const repository = files.find(
      (file) => file.path === 'proactive/proactive-notifications.repository.ts',
    );
    const schema = files.find(
      (file) => file.path === 'proactive/proactive-notifications.schema.ts',
    );

    expect(repository?.text.match(/onConflictDo(Nothing|Update)\(/g)).toHaveLength(3);
    expect(repository?.text).toMatch(/async markRead\(householdId: string/);
    expect(repository?.text).toMatch(/async listRecent\(householdId: string/);
    expect(schema?.text).toContain('proactive_notifications_household_event_key_unique');
    expect(schema?.text).toContain('notification_deliveries_once_per_recipient_unique');
    expect(schema?.text).not.toMatch(/jsonb|payload|phone|address/);
  });

  it('keeps recurring detection deterministic and inside the finance domain', () => {
    const recurring = within('finance/domain/recurring/');
    const allowed =
      /^\.\.\/(\.\.\/\.\.\/money\/|finance-policy\.js|ledger\/|period\/|statistics\.js)|^\.\/recurring-/;

    expect(recurring.map((file) => file.path).sort()).toEqual([
      'finance/domain/recurring/recurring-expense-detector.ts',
      'finance/domain/recurring/recurring-summary.ts',
    ]);
    expect(
      offenders(recurring, (file) => importsOf(file).some((name) => !allowed.test(name))),
    ).toEqual([]);
    expect(
      offenders(recurring, (file) =>
        /new Date\(|Date\.now|Math\.random|process\.env|parseFloat|toFixed|async |await /.test(
          file.text,
        ),
      ),
    ).toEqual([]);
  });

  it('keeps every recurrence threshold in the finance policy', () => {
    const detector = files.find(
      (file) => file.path === 'finance/domain/recurring/recurring-expense-detector.ts',
    );
    const policy = files.find((file) => file.path === 'finance/domain/finance-policy.ts');

    expect(detector?.text).not.toMatch(/\b\d{2,}\b/);
    for (const threshold of [
      'minimumOccurrences',
      'amountToleranceBasisPoints',
      'maximumPriceChangeBasisPoints',
      'recentChangeWithinDays',
      'stoppedVisibleForDays',
      'graceInDays',
      'occurrencesPerYear',
    ]) {
      expect(policy?.text).toContain(threshold);
    }
  });

  it('lets only the finance engine detect, total or judge recurring expenses', () => {
    const outsideFinance = files.filter((file) => !file.path.startsWith('finance/'));
    const judging =
      /detectRecurringExpenses|summarizeRecurringExpenses\(|upcomingCommitments\(|occurrencesPerYear|annualEquivalentMinor\s*[-+*/=]|monthlyEquivalentMinor\s*[-+*/]|graceInDays|amountToleranceBasisPoints/;

    expect(
      offenders(
        outsideFinance.filter((file) => file.path !== 'cfo/analysis/monthly-review.ts'),
        (file) => judging.test(file.text),
      ),
    ).toEqual([]);
    expect(
      offenders(within('ai/', 'conversation/', 'proactive/', 'whatsapp/', 'dashboard/'), (file) =>
        importsOf(file).some((name) => name.includes('recurring-expense-detector')),
      ),
    ).toEqual([]);
    expect(
      offenders(within('ai/'), (file) =>
        importsOf(file).some((name) => name.includes('recurring')),
      ),
    ).toEqual([]);
  });

  it('answers recurring questions through finance methods scoped to the household', () => {
    const queries = files.find(
      (file) => file.path === 'conversation/queries/financial-query.service.ts',
    );
    const finance = files.find((file) => file.path === 'finance/application/finance.service.ts');
    const dashboard = files.find((file) => file.path === 'dashboard/dashboard.service.ts');

    for (const method of ['recurringCommitments', 'upcomingRecurring', 'recurringChanges']) {
      expect(queries?.text).toContain(`this.finance.${method}(householdId, today)`);
      expect(finance?.text).toMatch(
        new RegExp(`async ${method}\\(householdId: string, asOf: IsoDate\\)`),
      );
    }
    expect(dashboard?.text).toContain(
      'this.finance.recurringCommitments(context.householdId, today)',
    );
  });

  it('treats transactions as the source of truth and stores no recurring copies', () => {
    expect(
      offenders(files, (file) =>
        importsOf(file).some((name) => name.includes('recurring-expenses.schema')),
      ),
    ).toEqual([]);
    expect(
      offenders(within('finance/', 'cfo/', 'proactive/', 'conversation/queries/'), (file) =>
        /\.(insert|update|delete)\((transactions|recurringExpenses)\)/.test(file.text),
      ),
    ).toEqual([]);
  });

  it('keeps the financial domain independent of security, sessions and HTTP', () => {
    const domain = within(
      'finance/',
      'money/',
      'cfo/',
      'transactions/',
      'budgets/',
      'goals/',
      'accounts/',
      'categories/',
      'directory/',
    );

    expect(
      offenders(domain, (file) =>
        importsOf(file).some((name) => /\/security\/|\/auth\/|\/dashboard\/|node:http/.test(name)),
      ),
    ).toEqual([]);
    expect(
      offenders(within('finance/domain/', 'money/'), (file) =>
        importsOf(file).some((name) => name.startsWith('@nestjs')),
      ),
    ).toEqual([]);
  });

  it('keeps every security threshold in the security policy', () => {
    const policy = files.find((file) => file.path === 'security/security-policy.ts');
    const security = within('security/').filter(
      (file) => file.path !== 'security/security-policy.ts',
    );

    for (const setting of [
      'requestBodyLimitInBytes',
      'rateLimits',
      'inboundMessages',
      'maximumPerMember',
      'lifetimeInDays',
      'minimumWebhookSecretLength',
    ]) {
      expect(policy?.text).toContain(setting);
    }
    expect(
      offenders(security, (file) => /limit:\s*\d|windowInSeconds:\s*\d/.test(file.text)),
    ).toEqual([]);
    expect(
      offenders(within('auth/'), (file) =>
        /LIFETIME_IN_DAYS\s*=|MAXIMUM_SESSIONS\s*=/.test(file.text),
      ),
    ).toEqual([]);
  });

  it('rate limits every public controller and hardens HTTP at startup', () => {
    const controllers = files.filter(
      (file) => file.path.endsWith('.controller.ts') && !file.path.startsWith('health/'),
    );
    const main = files.find((file) => file.path === 'main.ts');

    expect(controllers.map((file) => file.path).sort()).toEqual([
      'auth/auth.controller.ts',
      'dashboard/dashboard.controller.ts',
      'whatsapp/whatsapp-webhook.controller.ts',
    ]);
    for (const controller of controllers) {
      expect(controller.text).toMatch(/@RateLimit\('(AUTHENTICATION|DASHBOARD|WEBHOOK)'\)/);
      expect(controller.text).toContain('RateLimitGuard');
    }
    expect(main?.text).toContain('hardenHttp(app, config)');
    expect(
      offenders(files, (file) => /enableCors|Access-Control-Allow-Origin/.test(file.text)),
    ).toEqual([]);
  });

  it('logs unexpected errors only through the safe filter, never with their message', () => {
    const filter = files.find((file) => file.path === 'security/safe-exception.filter.ts');

    expect(filter?.text).toContain('@Catch()');
    expect(filter?.text).not.toMatch(/error\.message|\.stack\)|JSON\.stringify\(error/);
    expect(
      offenders(files, (file) =>
        /logger\.(log|warn|error|debug)\([^)]*(\.message|\.stack|rawBody|\.text\b|accessCode|token\b|apiKey|\.sender|amountMinor|merchant)/.test(
          file.text,
        ),
      ),
    ).toEqual([]);
    expect(
      offenders(files, (file) => /console\.(log|error|warn|info|debug)\(/.test(file.text)),
    ).toEqual([]);
  });

  it('reads the environment only in the configuration loader and the entry scripts', () => {
    expect(offenders(files, (file) => file.text.includes('process.env')).sort()).toEqual([
      'auth/issue-access-code.ts',
      'auth/revoke-access.ts',
      'config/config.module.ts',
      'database/run-migrations.ts',
      'database/seed/run-seed.ts',
    ]);
  });

  it('compares secrets in constant time and stores only their hashes', () => {
    const kapso = files.find((file) => file.path === 'whatsapp/kapso/kapso-whatsapp-provider.ts');
    const auth = files.find((file) => file.path === 'auth/auth.service.ts');

    expect(kapso?.text).toContain('timingSafeEqual(');
    expect(kapso?.text).not.toMatch(/expected\s*[!=]==|[!=]==\s*expected|digest\('hex'\)\s*[!=]==/);
    expect(auth?.text).toContain('randomBytes(SECRET_BYTES)');
    expect(auth?.text).toMatch(/SECRET_BYTES = 32/);
    expect(auth?.text).not.toMatch(/Math\.random|randomUUID/);
  });

  it('fetches remote content only from the provider origin, without following redirects', () => {
    const media = files.find((file) => file.path === 'whatsapp/kapso/kapso-media-source.ts');

    expect(media?.text).toContain("redirect: 'error'");
    expect(media?.text).toContain('url.origin !== new URL(this.options.apiBaseUrl).origin');
    expect(media?.text).toContain('signal: timeoutOf(this.options)');
    expect(media?.text).toContain('limitTo(request.maximumBytes)');
  });

  it('keeps financial calculation out of the messaging layer', () => {
    const messaging = within('whatsapp/');
    const financialLogic = /finance\/domain|money-math|Minor\b|BasisPoints|formatMoney|parseMoney/;

    expect(offenders(messaging, (file) => financialLogic.test(file.text))).toEqual([]);
  });

  it('claims webhook events through the unique key and nowhere else', () => {
    const writers = files.filter((file) => file.text.includes('insert(webhookEvents)'));

    expect(writers.map((file) => file.path)).toEqual(['whatsapp/webhook-events.repository.ts']);
    expect(writers[0]?.text).toContain('onConflictDoNothing');
  });

  it('defines no column that could hold image bytes', () => {
    const schemas = files.filter((file) => file.path.endsWith('.schema.ts'));

    expect(schemas.length).toBeGreaterThan(8);
    expect(offenders(schemas, (file) => /bytea|customType|blob/i.test(file.text))).toEqual([]);
  });

  it('writes files only from the Kapso media source, into the path it is given', () => {
    const writesFiles = /\b(writeFile|createWriteStream|appendFile|copyFile)\b/;

    expect(offenders(files, (file) => writesFiles.test(file.text))).toEqual([
      'whatsapp/kapso/kapso-media-source.ts',
    ]);
  });
});
