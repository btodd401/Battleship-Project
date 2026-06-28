# Battleship Game - Human vs AI

A simple web-based Battleship game where a human player competes against an AI opponent.

## Features

- **10x10 Game Board**: Classic Battleship grid (A1-J10)
- **5 Ship Types**: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- **Ship Graphics**: Scalable SVG ship silhouettes that span their cells in both orientations (replaces the old plain blocks)
- **Ship Placement**: Manual placement with rotation or random auto-placement
- **AI Opponent**: AI places ships randomly and fires at player's board
- **Turn-Based Gameplay**: Player and AI alternate turns
- **Hit/Miss Tracking**: Visual feedback for hits and misses
- **Ship Sinking Detection**: Ships are marked as sunk when all cells are hit
- **Win/Lose Conditions**: Game ends when all ships of one side are sunk

## How to Run

Since this is a static HTML/CSS/JavaScript application, you can simply open the `index.html` file in your web browser:

1. Navigate to the project directory: `/Users/brendantodd/CascadeProjects/battleship-game`
2. Double-click `index.html` or open it in your browser

Alternatively, if you have Python installed with developer tools, you can run a local server:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

## How to Play

1. **Place Your Ships**:
   - Click on a ship from the list (Carrier, Battleship, Cruiser, Destroyer)
   - Click on your board to place the ship
   - Press 'R' or click "Rotate" to change ship orientation
   - Or click "Random Placement" to auto-place all ships

2. **Start the Game**:
   - Once all ships are placed, click "Start Game"
   - The AI will place its ships automatically

3. **Battle**:
   - Click on the enemy board to fire at a coordinate
   - Hits are marked with 💥, misses with •
   - AI will automatically fire back after your turn
   - First to sink all enemy ships wins!

## Game Architecture

### Separation of Concerns

- **game.js**: Core game logic (board state, ship placement, hit detection, AI logic)
- **styles.css**: Visual styling and responsive design
- **index.html**: Structure and layout

### Key Components

- **Board Representation**: 2D array with cell state (hasShip, isHit, isMiss)
- **Ship Management**: Track ship positions and hit counts
- **AI Logic**: Random ship placement and firing strategy
- **Game State Management**: Phases (placement, playing, gameover), turn tracking
- **UI Rendering**: Dynamic board updates based on game state

## Future Enhancements

- Enhanced AI with targeting intelligence (hunt mode when ships are hit)
- Ship placement validation with visual feedback
- Game statistics and score tracking
- Multiple difficulty levels for AI
- Sound effects and animations
- Multiplayer support
