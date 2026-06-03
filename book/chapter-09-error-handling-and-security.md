# Chapter 26 — Error Handling, Security, and Middleware

## The Security Philosophy

Security in AuctionHaus follows a "defence in depth" approach: multiple independent layers, each catching a different class of attack. A request that bypasses one layer should fail at the next. No single point of failure.

---

## The Middleware Stack in Order

```
Request arrives at Node.js HTTP server
      │
      ▼
1. helmet()            — HTTP security headers
2. cors()              — Cross-origin policy
3. morgan()            — HTTP request logging
4. express.json()      — Parse JSON request bodies
5. rateLimiter         — Throttle by IP
6. Routes              — The actual handlers
      │ (inside routes)
      ▼
7. authenticate()      — JWT verification + user lookup
8. requireAdmin()      — Admin role check (admin routes only)
9. Controller          — Validates with Zod, calls service
10. Service            — Business logic, throws AppError on failure
      │
      ▼
11. errorHandler       — Catches all thrown errors, formats response
```

This order is not arbitrary. Each step depends on the previous ones.

---

## Layer 1: Helmet

Helmet sets HTTP security headers that the browser respects:

```typescript
app.use(helmet());
```

Headers set:
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing (XSS vector)
- `X-Frame-Options: DENY` — prevents clickjacking (your page inside an iframe)
- `Strict-Transport-Security` — forces HTTPS (only effective on HTTPS deployments)
- `X-XSS-Protection: 0` — disables legacy XSS filter (modern CSP is better)
- `Content-Security-Policy` — restricts what JavaScript can execute (Helmet's default)

These are all set in a single line of code. Every AuctionHaus response includes them. Without them, browsers have weaker protections against common client-side attacks.

---

## Layer 2: CORS

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
```

Cross-Origin Resource Sharing. The browser blocks requests from `https://evil.com` to `https://api.auctionhaus.io` by default. The CORS header tells the browser: "I trust requests from `FRONTEND_URL`."

`credentials: true` is required because the frontend sends the `ah_logged_in=1` cookie alongside API requests. Without it, cookies are stripped.

**Why whitelist only `FRONTEND_URL`?** If CORS allowed `*` (any origin), an attacker could serve malicious JavaScript from their domain that makes API calls on behalf of a logged-in user (Cross-Site Request Forgery). Whitelisting prevents this.

---

## Layer 3: Rate Limiting

```typescript
// back/src/middleware/rateLimiter.middleware.ts
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  message: { message: 'Too many requests, please try again later.' },
});

const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,  // 10 per 15 minutes for auth routes
  message: { message: 'Too many auth attempts, please try again later.' },
});
```

Why two rate limiters?

**General (200/15min):** The catalogue page, auction detail, bid history — these are read-heavy. 200 requests per 15 minutes is permissive for a real user and strict for automated scraping.

**Strict (10/15min):** Login and register. Ten failed login attempts per 15 minutes is generous for a human but strictly limits brute-force password attacks. An attacker trying 1000 passwords would be throttled after 10 attempts.

Rate limiting is applied at the IP level. For a production system, this would use Redis to share state across instances (`express-rate-limit` with a Redis store). For the demo, in-memory per-process is sufficient.

---

## Layer 4: Authentication Middleware

```typescript
// auth.middleware.ts
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    
    // Cache hit short-circuit (Phase A9)
    let user = cacheGet(payload.id);
    if (!user) {
      const fresh = await prisma.user.findUnique({ where: { id: payload.id }, select: {...} });
      if (!fresh) return res.status(401).json({ message: 'User not found' });
      cacheSet(fresh);
      user = fresh;
    }
    
    if (user.isSuspended) return res.status(403).json({ message: 'Account suspended' });
    
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
```

**Why check `isSuspended` on every request?** JWTs are stateless — they carry no information about whether the account is suspended. A JWT issued before suspension has no way to know. The only way to immediately revoke a JWT is to check the account state in the database (or cache) on every request. The 30-second cache means a suspended user can still access the system for up to 30 seconds after suspension. The cross-instance pub/sub invalidation (Phase A9.x) reduces this to near-zero for the instance that processed the suspension.

**Why `jwt.verify` and not `jwt.decode`?** `jwt.verify` checks the signature (that the token was issued by this server with the correct secret) AND the expiry claim. `jwt.decode` only parses the payload without any verification. Using `decode` instead of `verify` would mean any forged token is accepted.

---

## The Error Handling System

### `AppError` and `createError`

```typescript
// error.middleware.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const createError = (message: string, statusCode: number): AppError => {
  return new AppError(message, statusCode);
};
```

`createError` is the most-called function in the codebase (49 edges in the knowledge graph — the top god-node). Every service uses it to signal expected failures:

```typescript
if (auction.status !== 'ACTIVE') throw createError('Auction is not active', 400);
if (bid.bidderId !== req.user.id) throw createError('Forbidden', 403);
```

By throwing an `AppError`, the service trusts that the `errorHandler` middleware will catch it and format the response correctly. Services do not need to call `res.status(...).json(...)` themselves.

`isOperational: true` distinguishes expected errors (bad input, not found, insufficient funds) from programming errors (null pointer, type error). The error handler treats non-operational errors as 500s and logs them more prominently.

### The `errorHandler` Middleware

```typescript
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: zodIssuesToErrors(err.issues),
    });
  }
  
  // Expected application errors
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  
  // Prisma unique constraint violation (e.g., duplicate email, duplicate watchlist)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({ message: 'Already exists' });
  }
  
  // Unexpected error (programming bug, not user error)
  console.error('[ERROR]', err);
  return res.status(500).json({ message: 'Internal server error' });
};
```

The handler must be the LAST middleware registered (Express identifies it by the four-argument `(err, req, res, next)` signature). It catches errors thrown anywhere in the route handlers.

**Zod error formatting:**
```typescript
function zodIssuesToErrors(issues: ZodIssue[]): Record<string, string> {
  return Object.fromEntries(
    issues.map(issue => [issue.path.join('.'), issue.message])
  );
}
```

A Zod error like "Required at ['startTime']" becomes `{ "startTime": "Required" }` — a field-keyed map that the frontend can display next to the input.

### The Prisma P2002 Unique Constraint Handler

When Prisma gets a unique constraint violation from Postgres (e.g., trying to register with an email that already exists), it throws `PrismaClientKnownRequestError` with code `P2002`. Without this handler, that would become a 500.

The handler converts it to a 409 Conflict. This is handled in the global error handler rather than in each service that might hit a unique constraint, avoiding repetition.

---

## JWT Details

**Signing algorithm:** HS256 (HMAC-SHA256). The token is signed with a single shared secret (`JWT_SECRET`). Both signing and verification use this same secret. This is symmetric — only the server knows the secret.

**Payload:**
```typescript
jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
```

The payload contains `id`, `email`, and `role`. It does NOT contain `isSuspended` — that is always checked live from the database/cache. Including it would mean a token issued before suspension would have `isSuspended: false` even after suspension.

**Token storage on frontend:** localStorage. Why not httpOnly cookies? Because Socket.io authentication requires the token to be accessible from JavaScript (the `handshake.auth.token` pattern). httpOnly cookies cannot be read by JavaScript. The tradeoff: localStorage is accessible to JavaScript, so an XSS attack could steal the token. Mitigated by Helmet's XSS protection and CSP headers.

The `ah_logged_in=1` cookie (NOT httpOnly, NOT the token) is a boolean flag read by Next.js edge middleware to redirect logged-out users. It contains no sensitive information — it is just "is there a token in localStorage?"

---

## Input Validation with Zod

Every controller validates its input before calling the service:

```typescript
// bid.controller.ts
const placeBidSchema = z.object({
  amount: z.number().positive(),
});

export const placeBid = async (req: AuthRequest, res: Response) => {
  const { amount } = placeBidSchema.parse(req.body);
  // If parse() throws, the errorHandler catches ZodError → 400
  
  const bid = await bidService.placeBid({
    auctionId: req.params.id,
    bidderId: req.user!.id,
    amount,
  });
  
  res.status(201).json(bid);
};
```

Zod validation prevents:
- SQL injection (amount is guaranteed to be a number, not `'1 OR 1=1'`)
- Type errors in the service (service can trust `amount` is a number)
- Unexpected payload shapes (extra fields are stripped by Zod's `.parse()`, not `.safeParse()`)

The validation is in the controller, not the service. This means the service can be called directly (e.g., from the simulator or tests) with trusted data, without going through HTTP validation.

---

## The `requireAdmin` Middleware

```typescript
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
};
```

Applied on the admin router after `authenticate`:
```typescript
// admin.routes.ts
router.use(authenticate);
router.use(requireAdmin);
// All routes below require ADMIN role
```

This two-step pattern (authenticate first, then role check) means the authentication always runs. A non-ADMIN user gets a 403 (Forbidden), not a 401 (Unauthorized). This is the correct HTTP semantic: the user is authenticated (401 would be wrong) but not authorised for this resource (403 is correct).

---

## What Is Not Protected

Being honest about security gaps in the current implementation:

**No input size limits.** There is no `express.json({ limit: '1mb' })` configuration. An attacker could send a 100MB JSON body and cause memory issues. Production would add `express.json({ limit: '100kb' })`.

**No request signing.** The API does not use signed requests (like AWS Signature v4). Any code with a valid JWT can call any endpoint. In production, per-endpoint request signing would prevent replay attacks.

**No distributed rate limiting.** The rate limiter is in-memory per process. Multiple server instances each have their own count. An attacker can send 200 requests to Instance 1 and 200 more to Instance 2 — effectively bypassing the rate limit. Production uses Redis-backed `express-rate-limit`.

**No CSRF protection for REST.** REST APIs with JSON bodies are generally CSRF-resistant (browsers' cross-origin fetch protection), but explicit CSRF tokens would be belt-and-suspenders for cookie-based authentication.

All of these are explicit tradeoffs for a college project that are documented as future work.

---

## Next Chapter

The book's appendices — the quick reference card, every key file path, every command, and a one-page summary that could be handed to any developer coming on board.
