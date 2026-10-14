// On a device, a touch's timestamp and performance.now() count on one clock
// (React Native gives both as milliseconds on the system's steady clock), and
// the Sift screen judges a press by comparing them. Testing Library stamps
// its press events with Date.now(), so performance.now() reads Date.now()
// here too, fake timers included (jest.config.js keeps them off it). This
// holds for every test file.
performance.now = () => Date.now();
