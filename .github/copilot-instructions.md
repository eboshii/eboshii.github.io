# Copilot Context for eboshii.github.io

## Project Overview
This is a personal blog/portfolio website built with React and deployed on GitHub Pages. The site renders Markdown files as blog posts using the zero-md library.

## Project Structure
- `/posts/`: Contains Markdown files for blog posts (numbered sequentially)
- `/static/`: Contains compiled CSS, JavaScript, and media assets
  - `/static/css/`: Compiled CSS files
  - `/static/js/`: Compiled JavaScript files
  - `/static/media/`: Fonts, images, and other media assets

## Content Management
Blog posts are stored as Markdown files in the `/posts/` directory. They are named with a numeric prefix (e.g., `0.initial.md`, `1.blog_purpose.md`), which likely determines their display order.

## Technologies Used
- React
- GitHub Pages for hosting
- zero-md for rendering Markdown content

## Ship Operations Feature
Ship Operations has two distinct views:
1. **Table view**: Accessed via 'Add Table,' which allows right-click editing.
2. **Controller view**: Accessed via 'Add Controller,' which only shows control buttons without editing capability.

The ship_operations table uses ship_id as its primary identifier instead of id.

## Development Context
When making changes to this codebase:
- Remember that this is a static site hosted on GitHub Pages
- Blog content is managed through Markdown files in the posts directory
- The site's primary purpose is to share thoughts on finance, current events, D&D, video games, etc.
- Consider the existing styling and structure when making UI changes
- Maintain the simplicity of the current setup