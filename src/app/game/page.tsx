"use client"
import kaboom from "kaboom";
import * as React from "react";
import {useState, useEffect, useRef, useContext} from "react";
import {Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, useDisclosure} from "@nextui-org/react";
import {UserContext} from "@/components/usercontext";
import UserService from "@/services/userservice";


export default function GamePage() {
  const {user, setUser} = useContext(UserContext);
  const [currentHighScore, setCurrentHighScore] = useState(user.score as number);
  const [finalScore, setFinalScore] = useState(0);
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const updateHighScore = (scored: number) => {
    UserService.addHighScore(scored).then(response => {
        if (response.status === 200 && response.data.message.includes("Success")) {
          const userData = {
            username: user.username,
            email: user.email,
            score: scored,
          };
          setUser(userData);
          localStorage.setItem("user", JSON.stringify(userData));
          setCurrentHighScore(scored);
        }
    })
  }

  const processScore = (scored: number) => {
    setFinalScore(scored);
    if (scored > currentHighScore && user.username !== "") {
      onOpenChange();
      updateHighScore(scored);
    }
  }

  useEffect(() => {
    console.log(user)
    const k = kaboom({
      global: true,
      canvas: canvasRef.current as any,
      background: [0, 0, 25],
      width: 800,
      height: 700,
      scale: 1,
      debug: true,
    });

    const moveSpeed = 200;
    const bulletSpeed = 400;
    const GUN_COOLDOWN_TIME = 0.5;
    const baseSpawnTime = 2;

    // Initialize basic game variables
    let score = 0;
    let lives = 3;
    let level = 1;
    let lastShootTime = k.time();
    let pause = false;
    let spawnTime = calculateSpawnTime(level); // Get the initial spawn time
    let specialShootActive = false;
    let specialShootTimeout = 10;
    let MAX_LEVEL = 10;

    // -----------------------------Environment stuff---------------------------------------
    // load a font from a .ttf file
    k.loadFont("PixelEmulator", "fonts/PixelEmulator.ttf")

    // Display the score on the screen
    const scoreText = k.add([
      k.text(`Score: ${score}`, {font: "PixelEmulator"}),
      k.pos(10, 10), // You can change the position according to your need
      { value: 'scoreText' }, // An identifier for easy access if needed later
    ]);

    // Function to update the score
    function updateScore(value: number) {
      score += value;
      scoreText.text = `Score: ${score}`;
    }

    // Display lives on screen
    const livesText = k.add([
      k.text(`Lives: ${lives}`, {font: "PixelEmulator"}),
      k.pos(610, 10), // Position below the score for visibility
    ]);

    // Function to generate stars
    function generateStars(numberOfStars: number) {
      for (let i = 0; i < numberOfStars; i++) {
        const x = Math.random() * k.width();
        const y = Math.random() * k.height();
        k.add([
          k.rect(2, 2), // small rectangle to represent a star; adjust size as needed
          k.pos(x, y),
          k.color(k.rgb(255, 255, 255)), // white color for the star
        ]);
      }
    }

    // Call the function with the desired number of stars
    generateStars(200); // Adjust the number of stars as needed

    // Load the sprites
    k.loadSprite("spaceship", "sprites/starship.png");
    k.loadSprite("alien", "sprites/alien.png"); // Assuming this is already available in your sprites folder
    k.loadSprite("bullet", "sprites/laserBullet.png");
    k.loadSprite("powerUp", "sprites/powerUp.png");

    // ------------------------------------Player stuff------------------------------------------------
    // Define the player
    const player = k.add([
      k.sprite("spaceship"),
      k.pos(350, 600),
      k.scale(0.5),
      k.area(),
      k.body(),
      "spaceship",
    ]);

    // Keep the player within the game boundaries
    player.onUpdate(() => {
      // Get game dimensions
      const gameWidth = k.width();
      const gameHeight = k.height();

      // Constrain the ship's position within the game dimensions
      player.pos.x = Math.max(0, Math.min(player.pos.x, gameWidth-(player.width*.5)));
      player.pos.y = Math.max(0, Math.min(player.pos.y, gameHeight-(player.height*.5)));
    });

    // Player controls
    k.onKeyDown("left", () => {
      player.move(-moveSpeed, 0);
    });
    k.onKeyDown("right", () => {
      player.move(moveSpeed, 0);
    });
    k.onKeyDown("up", () => {
      player.move(0, -moveSpeed);
    });
    k.onKeyDown("down", () => {
      player.move(0, moveSpeed);
    });

    // Flicker function to make the player's spaceship blink
    function flicker(player: any) {
      const numFlickers = 10;
      const flickerDuration = 0.1;

      for (let i = 0; i < numFlickers; i++) {
        // Alternate between invisible and visible
        k.wait(i * flickerDuration * 2, () => player.hidden = !player.hidden);
      }
      // Make sure the spaceship is visible after the last flicker
      k.wait(numFlickers * flickerDuration * 2, () => player.hidden = false);
    }

    // ------------------------------------Enemy stuff-------------------------------------------------
    // Define enemy behavior
    function spawnEnemy() {
      // Assuming alien width is about 1/10th of the screen width, adjust as necessary
      const alienWidth = k.width() * 0.1;
      const minX = alienWidth / 2; // Minimum x-position
      const maxX = k.width() - alienWidth / 2; // Maximum x-position

      k.add([
        k.sprite("alien"),
        k.scale(0.3),
        k.pos(k.rand(minX, maxX), -30),
        k.area(),
        k.body(),
        k.move(k.DOWN, 120),
        "enemy",
      ]);
    }

    // Define a function to calculate spawn time based on level
    function calculateSpawnTime(level: number): number {
      // Use a formula that decreases time slowly and approaches a minimum value but never reaches 0
      // This is a logarithmic decrease. Adjust the divisor to control the rate of decrease
      const minSpawnTime = 0.1; // the minimum spawn time you want to approach
      const spawnTimeReduction = Math.log(level + 1) / (10 * level);
      const newSpawnTime = Math.max(baseSpawnTime - spawnTimeReduction, minSpawnTime);

      return newSpawnTime;
    }

    // Enemy spawn loop
    function startSpawningEnemies() {
      spawnEnemy(); // Spawn an enemy immediately

      setTimeout(() => {
        // Calculate new spawn time for next level
        spawnTime = calculateSpawnTime(level);
        // Spawn the next enemy after the calculated delay
        startSpawningEnemies();
      }, spawnTime * 1000); // Convert spawn time to milliseconds for setTimeout
    }

    // When an enemy goes off-screen at the bottom, respawn it at the top
    k.onUpdate("enemy", (enemy) => {
      if (enemy.pos.y > k.height()) {
        // Reset the enemy position to the top of the screen
        // You may want to randomize the x position if needed
        enemy.pos.y = -enemy.height;
        enemy.pos.x = k.rand(0, k.width() - enemy.width); // This assumes you want a random x position within the screen width
      }
    });

    // Function to spawn alien bullets as small red circles
    function spawnAlienBullet(alien: any) {
    const bulletStartPos = alien.pos.add(alien.width * 0.15, alien.height * 0.3);
      k.add([
        k.circle(4), // small circle with a radius of 4
        k.color(255, 0, 0), // red color
        k.pos(bulletStartPos), // start from the middle-bottom of the alien
        k.area(),
        k.move(k.DOWN, 200), // adjust the speed as needed
        "alienBullet",
      ]);
    }

    // Logic to make a random alien shoot
    k.loop(1, () => {
      // Find all enemies currently on screen
      const enemies = k.get("enemy");

      // If there are any enemies, choose a random one to shoot
      if (enemies.length > 0) {
        const shooter = k.choose(enemies);
        if (shooter) {
        spawnAlienBullet(shooter);
        }
    }
    });

    // When an alien bullet goes off-screen, destroy it
    k.onUpdate("alienBullet", (bullet) => {
      if (bullet.pos.y > k.height()) {
        k.destroy(bullet);
      }
    });

    // ------------------------------------Bullet/PowerUp stuff-----------------------------------------------
    // Define player shooting
    k.onKeyPress("space", () => {
      if (pause) return;
      if (k.time() - lastShootTime > GUN_COOLDOWN_TIME) {
        lastShootTime = k.time();
        if (specialShootActive) {
          shootSpecial();
        } else {
          shoot();
        }
      }
    });

    // Function to spawn bullets
    function shoot() {
      k.add([
        k.sprite("bullet"),
        k.pos(player.pos.add(26, -10)),
        k.area(),
        k.scale(0.1),
        k.move(k.UP, bulletSpeed),
        "bullet",
      ]);
    }

    // Function to shoot a special bullet
    function shootSpecial() {
      // Center bullet
      k.add([
        k.sprite("bullet"),
        k.pos(player.pos.add(26, -10)),
        k.area(),
        k.scale(0.1),
        k.move(k.UP, bulletSpeed),
        "bullet",
      ]);

      // Left bullet
      k.add([
        k.sprite("bullet"),
        k.pos(player.pos.add(0, 0)),
        k.area(),
        k.scale(0.1),
        k.move(k.vec2(-1, -1).unit(), bulletSpeed), // Move up and to the left
        "bullet",
      ]);

      // Right bullet
      k.add([
        k.sprite("bullet"),
        k.pos(player.pos.add(52, 0)), // Adjust X offset to match spaceship width
        k.area(),
        k.scale(0.1),
        k.move(k.vec2(1, -1).unit(), bulletSpeed), // Move up and to the right
        "bullet",
      ]);
    }

    // Function to create power-ups
    function createPowerUp() {
      const x = k.rand(0, k.width());
      const y = -30; // Start above the screen
      k.add([
        k.sprite("powerUp"), // Assuming you have a sprite for the power-up
        k.pos(x, y),
        k.area(),
        k.move(k.DOWN, 100), // Move downwards
        k.scale(0.1),
        "powerUp", // This tag is used for collision detection
      ]);
    }

    // When a bullet goes off-screen, destroy it
    k.onUpdate("bullet", (bullet) => {
      if (bullet.pos.y < 0) {
        k.destroy(bullet);
      }
    });

    // Function to give the player a special shoot
    function giveSpecialShoot(player: any) {
        if (specialShootActive) {
        clearTimeout(specialShootTimeout); // Reset the timer if power-up is picked up again
        } else {
        specialShootActive = true;
        // Modify the player's shoot function or behavior
        player.shoot = shootSpecial;
        }

        // Set a timeout for the special shoot duration, say 10 seconds
        specialShootTimeout = setTimeout(() => {
        specialShootActive = false;
        player.shoot = shoot; // Revert back to the normal shoot function
        }, 10000) as unknown as number;
    }

    // Spawn a power-up after 15 seconds 
    k.wait(15, () => {
      createPowerUp();
    });

    // ------------------------------------Collision stuff----------------------------------------------
    // Collision between spaceship and power-up
    k.onCollide("spaceship", "powerUp", (player, power) => {
      k.destroy(power); // This destroys the power-up
      giveSpecialShoot(player); // This grants the special shooting ability to the player
    });

    // Check collision of bullet with enemy
    k.onCollide("bullet", "enemy", (bullet, enemy) => {
      k.destroy(bullet);
      k.destroy(enemy);
      updateScore(100); // Add 10 points for each enemy destroyed
    });

    // Collision detection for alien bullets and the player's spaceship
    k.onCollide("spaceship", "alienBullet", (player, bullet) => {
      k.destroy(bullet);
      lives -= 1;
      livesText.text = `Lives: ${lives}`;

      if (lives <= 0) {
        k.destroy(player);
        gameOver(); // Call the game over function
      } else {
        // Implement flicker effect
        flicker(player);
      }
    });

    // Collision logic with enemy ships
    k.onCollide("spaceship", "enemy", (player, enemy) => {
      k.destroy(enemy);
      lives -= 1;
      livesText.text = `Lives: ${lives}`;

      if (lives <= 0) {
        k.destroy(player);
        gameOver(); // Call the game over function
      } else {
        // Implement flicker effect
        flicker(player);
      }
    });

    // ------------------------------------Game stuff---------------------------------------------------
    // Start the first level
    startLevel();

    // Function to start a level
    function startLevel() {
      if (level <= MAX_LEVEL) {
          // Reset or increase difficulty as needed
          resetPlayerPosition();
          // Here, you would include any logic that needs to run at the start of each level
          startSpawningEnemies();
          createPowerUp();
      //} else {
          // Player has completed all levels
          //gameComplete();
      }
      endLevel();
    }

    // Function to end a level
    function endLevel() {
      // Check conditions for ending the level
      k.wait(30, () => {
        if (lives > 0) {
          k.destroyAll("bullet");
          k.destroyAll("enemy"); 
          k.destroyAll("alienBullet");
          k.destroyAll("powerUp");
          level += 1;
          const levelCompleteText = k.add([
            k.text(`Level ${level-1} Complete!`, { size: 24, font: "PixelEmulator" }),
            k.pos(235, 300)
            ]);
          k.wait(5, () => {
              k.destroy(levelCompleteText)
          });
          startLevel();
        }
      });
    }

    // Player mechanics
    function resetPlayerPosition() {
        // Reset the player's position to the starting point
    } 



    // Function to display game over text
    function gameOver() {
      // Destroy all game objects to clean up the game world
      k.destroyAll("bullet");
      k.destroyAll("enemy");
      k.destroyAll("spaceship");
      k.destroyAll("alienBullet");
      k.destroyAll("powerUp");
      // Display game over text
      k.add([
        k.text("GAME OVER", { size: 55, font: "PixelEmulator" }),
        k.pos(235, 300),
      ]);

      k.add([
        k.text("Press Enter to Restart", { size: 20, font: "PixelEmulator" }),
        k.pos(260, 355),
      ]);
      //check if new high score
      processScore(score);
      // Optionally, after a delay, offer to restart the game or go back to a main menu
      k.onKeyPress("enter", () => {
        window.location.reload();
        // possibly reset all variables
        startLevel();
      });
    }

  }, []);

  return (
    <div className="h-auto flex items-center justify-center p-5">
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">New high score!</ModalHeader>
              <ModalBody>
                <p>
                  Congratulations! You just got a new high score:
                </p>
                <p className="text-center font-bold text-5xl">
                  {finalScore}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <div>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
};


