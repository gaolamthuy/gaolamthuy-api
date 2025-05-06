# Fonts for Gao Lam Thuy Internal Service

This directory contains font resources used by the application, particularly for image processing with canvas.

## Directory Structure

```
src/assets/fonts/
├── index.js       # Font registration module
├── nunito/        # Nunito font family
│   ├── Nunito-Regular.ttf
│   ├── Nunito-Bold.ttf
│   ├── Nunito-ExtraBold.ttf  # Used for product label rendering
│   └── [Other weights...]
└── roboto/        # Reserved for future use
```

## Usage

To use these fonts in your application, import the registration module:

```javascript
const { registerFonts } = require('../assets/fonts');

// Register all fonts
registerFonts();
```

Then you can use the fonts in canvas operations:

```javascript
ctx.font = '30px "NunitoExtraBold"';  // For extra bold text
ctx.font = 'bold 30px "Nunito"';      // For bold text
ctx.font = '30px "Nunito"';           // For regular text
```

## Special Fonts

- **NunitoExtraBold**: Registered as a separate font family to allow specific use of extra bold weight
- **Nunito**: The main font family with multiple weights

## Weight Map

The fonts are registered with the following weights:

| Font File             | Weight | Value |
|-----------------------|--------|-------|
| Nunito-Thin.ttf       | Thin   | 100   |
| Nunito-ExtraLight.ttf | ExtraLight | 200 |
| Nunito-Light.ttf      | Light  | 300   |
| Nunito-Regular.ttf    | Regular| 400   |
| Nunito-Medium.ttf     | Medium | 500   |
| Nunito-SemiBold.ttf   | SemiBold | 600 |
| Nunito-Bold.ttf       | Bold   | 700   |
| Nunito-ExtraBold.ttf  | ExtraBold | 800 |
| Nunito-Black.ttf      | Black  | 900   | 