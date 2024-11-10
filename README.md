# PATCH - Screenplay Formatting Assistant

PATCH is a web-based screenplay formatting tool that helps writers convert their raw text into properly formatted screenplays following Hollywood standards. This project is built with [Next.js](https://nextjs.org) and bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

- Real-time screenplay formatting
- Live preview with proper formatting
- Export to PDF
- Customizable display options:
  - Multiple font types (Sans-serif, Serif, Monospace, etc.)
  - Adjustable font sizes (12px - 24px)
  - Bold text toggle
- Character limit indicator (1,875 characters)
- Re-roll functionality for alternative formatting

## Technical Details

### Core Components
- Editor component with real-time formatting
- PDF export functionality
- Ollama API integration for script processing

### API Configuration
- Context window: 4096 tokens
- GPU acceleration enabled
- 8 thread processing
- Temperature: 0.0 (focused output)
- Top-k: 30
- Top-p: 0.7
- Repeat penalty: 0.8

## Getting Started

1. Clone the repository

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up environment variables:
```env
NEXT_PUBLIC_OLLAMA_BASE_URL=your_ollama_url
NEXT_PUBLIC_OLLAMA_MODEL=your_model_name
```

4. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser

## Usage

1. Enter your unformatted script in the left text box
2. Click "Format" to convert your text
3. Preview the formatted version in the right panel
4. Adjust display settings using the top toolbar
5. Export to PDF when satisfied with the formatting

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Technical Requirements

- Node.js 16.x or higher
- Next.js 14.x
- Modern web browser with JavaScript enabled
- Ollama API endpoint

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

© 2023 PATCH. All rights reserved.

## Support

For support, please open an issue in the repository or contact the development team.
