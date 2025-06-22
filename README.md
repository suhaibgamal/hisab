# Hisab – Arabic Expense Sharing Web App

## Overview

**Hisab** (حساب) is a modern, open-source web application for managing and splitting shared expenses and settling debts among friends and family, with a focus on Arabic-speaking users. Built with Next.js, Supabase, and Tailwind CSS, Hisab offers a seamless, secure, and mobile-friendly experience.

---

## Features

- **Smart Expense Splitting**: Add expenses, split them automatically, and track who owes whom.
- **Instant Debt Settlement**: Request and confirm settlements with a click, with a full transaction log.
- **Group Management**: Create and join groups for friends, family, or events, with invite links.
- **Authentication**: Secure login and user management via Supabase Auth.
- **Activity Log**: Transparent history of all group actions.
- **Role Management**: Assign managers, control group settings, and manage members.
- **Arabic-first UI**: RTL layout, Arabic text, and localized experience.
- **Free & Open Source**: No hidden fees, fully open for contributions.

---

## Demo

> **Live Demo:** _Coming soon!_

## Technologies Used

- [Next.js](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [Supabase](https://supabase.com/) (Database, Auth, Functions)
- [Tailwind CSS](https://tailwindcss.com/)
- [Sonner](https://sonner.emilkowal.ski/) (Notifications)
- [React Icons](https://react-icons.github.io/react-icons/)

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker Desktop (for local Supabase)
- Supabase CLI (`npm i -g supabase`)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/hisab.git
cd hisab
npm install
```

### Environment Variables

Create a `.env.local` file in the root:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Running Locally

```bash
npm run dev
```

App will be available at [http://localhost:3000](http://localhost:3000)

### Supabase Setup

- Start local Supabase: `supabase start`
- Apply migrations: `supabase db reset`
- Deploy functions: `supabase functions deploy <function-name>`

---

## Deployment

- **Vercel**: One-click deploy (recommended for Next.js)
- **Manual**: Build and serve with `npm run build && npm start`
- **Supabase**: Ensure all migrations and functions are deployed to your Supabase project.

---

## Project Structure

```
app/           # Next.js app router pages and layouts
components/    # Reusable React components
lib/           # Supabase and utility libraries
public/        # Static assets and icons
supabase/      # Database, migrations, and edge functions
```

---

## Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or improvements.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

## Contact & Support

- **Author:** Suhaib Gamal
- **Email:** [your.email@example.com](mailto:your.email@example.com)
- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/hisab/issues)

---

## Roadmap

- [ ] Polish UI/UX and add more themes
- [ ] Add notifications and reminders
- [ ] Mobile PWA support
- [ ] Multi-language support
- [ ] Export/Import data
- [ ] More advanced analytics

---

## Acknowledgements

- [Supabase](https://supabase.com/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [All contributors](https://github.com/YOUR_USERNAME/hisab/graphs/contributors)

---

## Security

- All sensitive data is protected via Supabase RLS (Row Level Security).
- Never commit `.env.local` or secrets to the repository.

---

## FAQ

**Q: Is Hisab free?**
A: Yes, it's 100% free and open source.

**Q: Can I use it in English?**
A: English UI is coming soon!

**Q: How do I deploy to my own Supabase?**
A: Update `.env.local` with your Supabase credentials and run the setup steps above.

---

## Badges

![Next.js](https://img.shields.io/badge/Next.js-15-blue)
![Supabase](https://img.shields.io/badge/Supabase-Edge-green)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.0-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
