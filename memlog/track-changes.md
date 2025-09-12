# Track Changes
## 2025-09-12
- Typed startsWithIgnoreCase parameters as string.
```diff
-const startsWithIgnoreCase = (str, prefix) => str.toLowerCase().startsWith(prefix.toLowerCase());
+const startsWithIgnoreCase = (str: string, prefix: string): boolean => str.toLowerCase().startsWith(prefix.toLowerCase());
```
