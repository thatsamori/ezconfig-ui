screen or tmux: These terminal multiplexers allow you to start a session, run commands, and then detach from the session, leaving the processes running. You can reattach later if needed.
Start a new detached screen session:
bash
screen -dmS my-session bun run <script-name>
Reattach to the session later:
bash
screen -r my-session
