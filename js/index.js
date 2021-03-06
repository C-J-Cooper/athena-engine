let lib = null;
let globalGameState = null;
let isBoardFlipped = false;
let pawnPromotionSrc = "--";
let pawnPromotionDest = "--";

async function main() {
    // Import the rust wasm code
    lib = await import("../pkg/index.js").catch(console.error);
    globalGameState = lib.GameState.new();

    setupPage();
}

main();

// Webpage setup
function setupPage() {
    // Setup the chess pieces
    setupChessBoardSquares();

    // Set the chess pieces
    startingPositionFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    setBoardFromFenString(startingPositionFen);

    // Setup the user config GUI
    setupConfigGUI();
    updatePlayerClocks();
}

// Config GUI
function setupConfigGUI() {

    var resetButton = document.getElementById("reset-board-button");
    resetButton.onclick = resetBoard;

    var pawnPromotionButton = document.getElementById("submit-promotion");
    pawnPromotionButton.onclick = submitSelectedPromotion;

    console.log("Setting the gameover close button function");
    var gameoverPopupCloseButton = document.getElementById("game-over-close-button");
    gameoverPopupCloseButton.onclick = closeGameoverPopup;
}

function resetBoard() {
    console.log("resetBoard");

    globalGameState.reset_board();
    isBoardFlipped = false;

    var whitePlayerElement = document.getElementById("white-player-type");
    var blackPlayerElement = document.getElementById("black-player-type");
    var chessPositionElement = document.getElementById("chess-position");

    var whitePlayer = whitePlayerElement.options[whitePlayerElement.selectedIndex].value;
    var blackPlayer = blackPlayerElement.options[blackPlayerElement.selectedIndex].value;
    var chessPosition = chessPositionElement.options[chessPositionElement.selectedIndex].value;

    // Send the player info to the rust engine...
    // 0 = Human player
    // 1 = Computer player 
    let whitePlayerEnum = 0;
    let blackPlayerEnum = 0;
    if (whitePlayer == "Computer")
        whitePlayerEnum = 1;
    if (blackPlayer == "Computer")
        blackPlayerEnum = 1;

    if (whitePlayer == "Computer" && blackPlayer == "Human")
        isBoardFlipped = true;

    globalGameState.set_players(whitePlayerEnum, blackPlayerEnum);

    var fenString = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (chessPosition == "Mid Game") {
        fenString = "r2q1rk1/1b2ppb1/1p4pp/p1nnN3/P2N4/2P5/1PBB1PPP/R2QR1K1 w KQkq - 0 1"
    } else if (chessPosition == "Test Queen") {
        fenString = "8/6R1/3n4/8/1r1Q4/8/4p1P1/K1k5 w KQkq - 0 1";
    } else if (chessPosition == "Test Checkmate") {
        fenString = "6k1/5ppp/8/1R6/8/2K5/8/8 w KQkq - 0 1";
    } else if (chessPosition == "Test Promotion") {
        fenString = "5k2/1P6/8/8/3K4/8/8/8 w KQkq - 0 1";
    } else if (chessPosition == "Test Draw") {
        fenString = "8/3p4/1p6/pP6/P2K1q2/7r/6k1/8 w KQkq - 0 1";
    }
    setBoardFromFenString(fenString);
    globalGameState.set_board(fenString);

    updatePlayerClocks();

    if (whitePlayer == "Computer")
        makeNextMove();
}

// Piece event handlers
function onDragStart(event) {
    event.dataTransfer.setData("text/html", event.target.id);
}

// Square event handlers
function onDragOver(event) {
    event.preventDefault();
}

function onDrop(event) {
    event.preventDefault();
    var id = event.dataTransfer.getData("text/html");

    // Get the source and destination squares
    var srcSquare = document.getElementById(id).parentElement;
    var destSquare;
    if (isCaptureMove(event.target)) {
        var capturedPiece = event.target;
        var capturingPiece = document.getElementById(id);
        
        // Piece was dropped back onto the same square
        if (capturedPiece == capturingPiece) {
            return;
        }

        destSquare = event.target.parentElement;
    } else {
        destSquare = event.target;
    }

    // Grab the rank and file from the src and destination squares
    var srcSquareCoords = srcSquare.id;
    var destSquareCoords = destSquare.id;

    if (isBoardFlipped) {
        srcSquareCoords = flipCoords(srcSquareCoords);
        destSquareCoords = flipCoords(destSquareCoords);
    }

    if (!isPawnPromotion(id, destSquareCoords)) {
        makeMove(srcSquareCoords, destSquareCoords, 0);
    } else {
        // Pawn promotion move will not be made right away. A popup is created
        // that gets the promotion from the player. Only after that is the move made.
        // currently using global variables to store the src and dest coords... not ideal
        pawnPromotionSrc = srcSquareCoords;
        pawnPromotionDest = destSquareCoords;
        togglePromotionPopup();
    }
}

/// Sends the selected move to the rust backend
function makeMove(srcCoords, destCoords, selectedPromotion) {
    
    var is_move_legal = globalGameState.is_move_legal(srcCoords, destCoords);
    if (is_move_legal) {
        // Update the board
        globalGameState.make_move(srcCoords, destCoords, selectedPromotion); // Add an extra parameter to deal with promotions
        updateBoard();
        makeNextMove();
    }
}

/// Checks if the move entered by a human player is a promotion...
function isPawnPromotion(pieceId, destSquareCoords) {
    return (pieceId.includes("wP") && destSquareCoords.includes("8") ) ||
           (pieceId.includes("bP") && destSquareCoords.includes("1") );
}


/// Grabs the updated board position from the rust backend and renders to the
/// browser window.
function updateBoard() {
    var updated_position = globalGameState.get_board();
    setBoardFromArrayOfEnums(updated_position);
    if (globalGameState.is_checkmate()) {
        openGameoverPopup("Checkmate!");
    } else if (globalGameState.is_draw()) {
        openGameoverPopup("Draw!");
    }
}

function isCaptureMove(htmlElement) {
    // Does the id match the format of a piece id
    if (htmlElement.id.length == 5 && isAlpha(htmlElement.id[0]) && isAlpha(htmlElement.id[1])) {
        return true;
    }

    return false;
}

// Chess board setup functions
function setupChessBoardSquares() {
    
    // Set the chess pieces from the top left square (a8)
    var colourInx = 0;
    for (var rank = 8; rank >= 1; --rank) {

        rankElement = document.createElement("div");
        rankElement.id = "rank-".concat(rank.toString());
        rankElement.className = "rank";

        for (var file = 1; file <= 8; ++file) {

            squareElement = document.createElement("div");
            squareElement.id = squareFromRankAndFile(rank, file)

            if (colourInx%2 == 0) {
                squareElement.className = "light square";
            } else {
                squareElement.className = "dark square";
            }

            rankElement.appendChild(squareElement);

            ++colourInx;
        }

        chessBoardElement = document.getElementById("chess-board");
        chessBoardElement.appendChild(rankElement);

        ++colourInx;
    }

    // Assign the squares the correct event handlers
    var squares = document.getElementsByClassName("square");
    for (var i = 0; i < squares.length; ++i) {
        squares[i].ondragover = onDragOver;
        squares[i].ondrop = onDrop;
    }

}

function setBoardFromFenString(fenString) {
    // fenBoardString describes a board position using Forsyth-Edwarsd notation.
    // https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation

    clearBoard();

    if (!globalGameState.is_computer_move()) {
        isBoardFlipped = !globalGameState.is_white_to_move();
    }

    // Read the fen string and set the corresponding board position.
    // Begin setting the board in the top left square (a8)
    var rank = 8;
    var file = 1;
    for (var i = 0; i < fenString.length; ++i) {
        if (isDigit(fenString[i])) {
            file += fenString[i] - '0';
        } else if (fenString[i] == '/') {
            rank -= 1;
            file = 1;
        } else if (isAlpha(fenString[i])) {
            if (!isBoardFlipped)
                setPiece(fenString[i], rank, file);
            else
                setPiece(fenString[i], 8 - rank + 1, 8 - file + 1);
            file += 1; 
        } else if (fenString[i] == ' ') {
            break;
        } else {
            console.log("%s is an unrecognised character", fenString[i]);
        }
    }
}

function setBoardFromArrayOfEnums(boardPosition) {
    // boardPosition is a Uint8Array of length 64.
    // 0 = empty squares, odd num = black, even num = white
    // 1, 2 = pawn. 3, 4 = knight. 5, 6 = bishop, 7, 8 = rook, 
    // 9, 10 = queen. 11, 12 = king

    clearBoard();
    updatePlayerClocks();

    if (!globalGameState.is_computer_move()) {
        isBoardFlipped = !globalGameState.is_white_to_move();
    }

    for (var i = 0; i < 64; ++i) {
        var rank = Math.floor((64 - (i+1))/8) + 1; 
        var file = i%8 + 1;

        if (isBoardFlipped) {
            rank = 8 - rank + 1;
            file = 8 - file + 1;
        }

        switch (boardPosition[i]) {
            case 1:
                setPiece('p', rank, file);
                break;
            case 2:
                setPiece('P', rank, file);
                break;
            case 3:
                setPiece('n', rank, file);
                break;
            case 4:
                setPiece('N', rank, file);
                break;
            case 5:
                setPiece('b', rank, file);
                break;
            case 6:
                setPiece('B', rank, file);
                break;
            case 7:
                setPiece('r', rank, file);
                break;
            case 8:
                setPiece('R', rank, file);
                break;
            case 9:
                setPiece('q', rank, file);
                break;
            case 10:
                setPiece('Q', rank, file);
                break;
            case 11:
                setPiece('k', rank, file);
                break;
            case 12:
                setPiece('K', rank, file);
                break;
            default:
        }
    }
}

function clearBoard() {
    for (var rank = 1; rank <= 8; ++rank) {
        for (var file = 1; file <= 8; ++file) {
            clearSquare(rank, file);
        }
    }
}

function clearSquare(rank, file) {
    var squareCode = squareFromRankAndFile(rank, file);
    square = document.getElementById(squareCode);
    if (square != null) {

        // Find all pieces attached to the square and remove them
        var pieces = square.childNodes;
        pieces.forEach(piece => {
            square.removeChild(piece);
        });

    } else {
        console.log("Could not set %s at square %s. Square not found.", htmlId, squareCode);
    }
}

function setPiece(pieceAsFenChar, rank, file) {
    // pieceAsFenChar, a single character descrbing a chess piece. 
    // upper case for white pieces, lower case for black pieces.

    squareCode = squareFromRankAndFile(rank, file);

    let pieceColour = "white"; // upper
    if (isLowerChar(pieceAsFenChar)) {
        pieceColour = "black"; // lower
        pieceAsFenChar = pieceAsFenChar.toUpperCase();
    }

    
    var htmlId = pieceColour[0].concat(pieceAsFenChar).concat('-').concat(squareCode);
    var hmtlClass = "piece ";
    if (pieceAsFenChar == 'K') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-king");
    } else if (pieceAsFenChar == 'Q') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-queen");
    } else if (pieceAsFenChar == 'B') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-bishop");
    } else if (pieceAsFenChar == 'N') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-knight");
    } else if (pieceAsFenChar == 'R') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-rook");
    } else if (pieceAsFenChar == 'P') {
        hmtlClass = hmtlClass.concat(pieceColour).concat("-pawn");
    } else {
        console.log("Invalid character piece: %s", pieceAsFenChar);
    }

    let pieceElement = document.createElement("div");
    pieceElement.className = hmtlClass;
    pieceElement.id = htmlId;
    pieceElement.draggable = true;
    pieceElement.ondragstart = onDragStart;

    square = document.getElementById(squareCode);
    if (square != null) {
        square.appendChild(pieceElement);
    } else {
        console.log("Could not set %s at square %s. Square not found.", htmlId, squareCode);
    }

}

function makeNextMove() {
    setTimeout(() => {
        if (globalGameState.is_checkmate() || globalGameState.is_draw()) {
            // game is over. no next move.
            return;
        }
    
        if (globalGameState.is_computer_move()) {
            makeComputerMove();
        }
    }, 10);
}

function makeComputerMove() {
    console.log("js::getComputerMove: ");

    globalGameState.make_computer_move();
    updateBoard()
    makeNextMove();
}

/// Called on a button press when the user has selected the desired promotion.
/// Passes the move to the rust back end.
/// 1 = queen, 2 = rook, 3 = bishop, 4 = knight
function submitSelectedPromotion() {
    console.log("submit selected promotion");
    // call make move...

    var promotionElement = document.getElementById("selected-promotion");
    var promotionStr = promotionElement.options[promotionElement.selectedIndex].value;

    let promotionEnum = 0;
    if (promotionStr == "Queen") {
        promotionEnum = 1;
    } else if (promotionStr == "Rook") {
        promotionEnum = 2;
    } else if (promotionStr == "Bishop") {
        promotionEnum = 3;
    } else if (promotionStr == "Knight") {
        promotionEnum = 4;
    }

    makeMove(pawnPromotionSrc, pawnPromotionDest, promotionEnum);
    pawnPromotionSrc = pawnPromotionDest = "--";

    togglePromotionPopup();
}

function closeGameoverPopup() {
    console.log("js::closeGameoverPopup");
    let popupContentElement = document.getElementById("game-over-popup-content");
    let messageElement = document.getElementById("game-over-message");
    popupContentElement.removeChild(messageElement);
    document.getElementById("game-over-popup").classList.toggle("active");
}

function openGameoverPopup(message) {
    let popupContentElement = document.getElementById("game-over-popup-content");
    popupContentElement.insertAdjacentHTML("beforeend","<h1 id=\"game-over-message\">" + message +"</h1>");
    document.getElementById("game-over-popup").classList.toggle("active");
}

function togglePromotionPopup() {
    document.getElementById("pawn-promotion-popup").classList.toggle("active");
}

function updatePlayerClocks() {

    if (globalGameState.is_white_to_move()) {
        document.getElementById("white-move-indicator").style.display = "block";
        document.getElementById("black-move-indicator").style.display = "none";
    } else {
        document.getElementById("white-move-indicator").style.display = "none";
        document.getElementById("black-move-indicator").style.display = "block";
    }
}

// Helpers

function squareFromRankAndFile(rank, file) {
    if (rank < 1 || rank > 8 || file < 1 || file > 8) {
        console.log("rank = &d, file = %d", rank, file);
        throw "Invalid rank or file!";
    }

    let ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
    let files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    return files[file-1].concat(ranks[rank-1]);
}

/// flipCoords turns a1 into h8, b3 into g6, etc.
function flipCoords(coords) {
    if (coords.length != 2) {
        console.log("js::flipCoords: invalid coordinate");
        return "--";
    }
    let fileAlpha = coords[0];
    let rankDigit = coords[1]; 
    let flippedFile = 9 - (fileAlpha.charCodeAt(0) - 'a'.charCodeAt(0) + 1);
    let flippedRank = 9 - (rankDigit.charCodeAt(0) - '0'.charCodeAt(0));
    return squareFromRankAndFile(flippedRank, flippedFile);
}

function isDigit(c) {   
    return c >= '0' && c <= '9';
}

function isAlpha(c) {
    return isUpperChar(c) || isLowerChar(c);
}

function isUpperChar(c) {
    return c >= 'A' && c <= 'Z';
}

function isLowerChar(c) {
    return c >= 'a' && c <= 'z';
}