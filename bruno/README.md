# e-proshno API — Bruno Collection

This collection contains API requests for testing and exploring the **e-proshno** backend locally.

## Getting Started

1. Install [Bruno](https://www.usebruno.com/).
2. Open Bruno and select **Open Collection**, then choose this `bruno/` folder.
3. In the top right corner, select the **Local** environment (`http://localhost:5080/api/v1`).

## Authentication Flow

1. Run **Auth > Login (Teacher)** or **Auth > Login (Admin)**.
2. The post-response script will automatically save the JWT `accessToken` into the `token` environment variable.
3. Subsequent requests (Taxonomy, Questions, Sets, Dashboard, etc.) will automatically use `{{token}}` in their Bearer Auth header.

## Demo Credentials (Seeded in Development)

- **Platform Admin:** `admin@example.com` / `Admin12345` (SuperAdmin, ContentEditor)
- **Teacher (Coaching Owner):** `teacher@example.com` / `Teacher12345` (Owner of "নমুনা কোচিং সেন্টার")
