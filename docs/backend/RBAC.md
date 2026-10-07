# Authorization (RBAC)

Roles and permissions live in the database (`Role`, `Permission`, `RolePermission`) and are resolved **on the server for every request** (30 s in-process cache, invalidated on edits). The frontend may *reflect* permissions (they are returned from `/auth/me` for staff) but never decides them.

Declared per route, not scattered through code:

```ts
export const POST = route({ permission: "inventory:write", body: adjustStockBody }, handler)
```
`permission` implies authentication; `permissionMode: "any"` lets one of several suffice. A test (`admin.test.ts`) **walks every file under `app/api/v1/admin` and fails if any handler lacks `permission:`**, and a role × endpoint matrix test asserts allowed/forbidden for all 8 roles on 36 admin operations.

## Roles (seeded; editable by a super admin)

| Role | Intent | Permissions |
|---|---|---|
| `customer` | shopper | none (customer endpoints need only a session) |
| `support_agent` | tickets, lookups | order:read, customer:read, support:read/reply, review:moderate |
| `inventory_manager` | stock | dashboard:read, product:read, inventory:read/write |
| `order_manager` | fulfilment | dashboard:read, order:read/update/cancel/refund, return:manage, shipping:manage, customer:read, inventory:read, support:read |
| `product_manager` | catalogue & content | dashboard:read, product:read/write/delete, category/brand/collection/content:write, inventory:read, coupon:read, review:moderate |
| `manager` | day-to-day ops | all of the above operational permissions + analytics:read, customer:write, coupon:write, support:reply, notification:manage, audit:read |
| `admin` | everything except role editing | all permissions except `role:manage` |
| `super_admin` | unrestricted | all, incl. `role:manage` |

Permission catalogue: `dashboard:read analytics:read product:read product:write product:delete category:write brand:write collection:write content:write inventory:read inventory:write order:read order:update order:cancel order:refund return:manage shipping:manage customer:read customer:write coupon:read coupon:write review:moderate support:read support:reply notification:manage audit:read settings:manage user:manage role:manage`.

## Guard rails
* Changing a user's role **revokes their sessions** (so downgrades apply immediately) and is audited (`user.role_changed`).
* Only `role:manage` (super admin) may edit a role's permissions, grant/revoke `super_admin`; nobody can change their own role; `super_admin` and `customer` roles are protected from edits. `role.permissions_changed` is audited with before/after.
* Bulk archive additionally requires `product:delete`. Customer suspension/ban requires `customer:write` and kills sessions. Staff accounts are not addressable through the customer endpoints.
* Resource ownership is enforced independently of roles: customers only ever see their own orders, addresses, tickets, returns, wishlist (cross-user access returns `404`, not `403`, to avoid leaking existence).
