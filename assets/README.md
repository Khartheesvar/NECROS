# assets/ — media for the top-level README

Drop these files here and the main README picks them up automatically:

- **`logo.png`** — the NECROS logo (shown at the top).
- **`demo.gif`** — a short screen capture for the hero slot (~820px wide).

Suggested demo flow for the GIF:

1. The roadmap landing page (the six scenario cards).
2. Enter **Scenario 1 · Open Bus**.
3. Run the attack: `ros2 topic pub ... /amr1/cmd_vel ...` and show the robot
   leaving its route on the 3D console (status flips to compromised).
4. Enable SROS 2 from the defend walkthrough, re-run the attack, and show it
   refused (fleet goes dark to the attacker, robot stays on route).
