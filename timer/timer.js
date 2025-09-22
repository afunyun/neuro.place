setupBirthdayTimer();
function setupBirthdayTimer() {
	const second = 1000,
		minute = second * 60,
		hour = minute * 60,
		day = hour * 24;

	let today = new Date(),
		dd = String(today.getDate()).padStart(2, "0"),
		mm = String(today.getMonth() + 1).padStart(2, "0"),
		yyyy = today.getFullYear(),
		nextYear = yyyy + 1,
		dayMonth = "09/30/",
		birthdayStr = `${dayMonth}${yyyy}`;

	const _todayStr = `${mm}/${dd}/${yyyy}`;
	let birthdayDate = new Date(birthdayStr);
	if (today > birthdayDate) {
		birthdayStr = `${dayMonth}${nextYear}`;
		birthdayDate = new Date(birthdayStr);
	}

	const countDown = birthdayDate.getTime();
	const x = setInterval(() => {
		const now = Date.now();
		const distance = countDown - now;

		const daysElem = document.getElementById("days");
		const hoursElem = document.getElementById("hours");
		const minutesElem = document.getElementById("minutes");
		const secondsElem = document.getElementById("seconds");

		if (daysElem) daysElem.innerText = Math.floor(distance / day);
		if (hoursElem) hoursElem.innerText = Math.floor((distance % day) / hour);
		if (minutesElem)
			minutesElem.innerText = Math.floor((distance % hour) / minute);
		if (secondsElem)
			secondsElem.innerText = Math.floor((distance % minute) / second);

		if (distance < 0) {
			const headlineElem = document.getElementById("headline");
			const countdownElem = document.getElementById("countdown");
			const contentElem = document.getElementById("content");
			if (headlineElem) headlineElem.innerText = "It's my birthday!";
			if (countdownElem) countdownElem.style.display = "none";
			if (contentElem) contentElem.style.display = "block";
			clearInterval(x);
		}
	}, 1000);
}
