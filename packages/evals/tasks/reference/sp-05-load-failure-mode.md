The player is handed what looks like a brand-new account, and then that empty profile overwrites
their real save the moment they leave — a transient throttle has been converted into permanent data
loss, which is the worst possible outcome of a recoverable error. The handler should retry the read
several times with a growing back-off before it gives up. If every attempt fails it must not treat
the missing data as a default profile: mark the session as not loaded, block every save for that
player, and kick them with an explanation so they can rejoin onto a healthy server. A genuinely new
player is distinguishable from a failed read, because for a new player the read SUCCEEDS and returns
nil — so defaults are only ever safe on a successful load.
