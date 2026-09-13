import assert from "node:assert/strict";
import * as lib from "@clusterio/lib";
import { ControlConnection, InstanceManager } from "@clusterio/controller";
import { MockController } from "../mock.js";

describe("controller/src/ControlConnection", function() {
	describe(".handleControllerRestartRequest()", function() {
		let mockController;

		beforeEach(function() {
			mockController = {
				canRestart: true,
				shouldRestart: false,
				stopped: false,
				async checkRestartDowngrade() { return null; },
				stop() { this.stopped = true; },
			};
		});

		async function restart() {
			await ControlConnection.prototype.handleControllerRestartRequest.call({
				_controller: mockController,
			});
		}

		it("restarts when the installed version is not older", async function() {
			await restart();
			assert.equal(mockController.shouldRestart, true);
			assert.equal(mockController.stopped, true);
		});

		it("rejects a downgrade without stopping the controller", async function() {
			mockController.checkRestartDowngrade = async () => ({
				installedVersion: "1.0.0",
				runningVersion: "2.0.0",
			});

			await assert.rejects(restart, /Stop the controller before starting the older version manually/);
			assert.equal(mockController.shouldRestart, false);
			assert.equal(mockController.stopped, false);
		});
	});

	describe(".handleInstanceCreateRequest()", function() {
		let mockController;

		beforeEach(function() {
			mockController = new MockController();
			mockController.mockConfigEntries.set("controller.name", "Test");
			mockController.instances = new InstanceManager(new lib.SubscribableDatastore(), mockController);
		});

		async function create(config, cloneFromId) {
			await ControlConnection.prototype.handleInstanceCreateRequest.call(
				{ _controller: mockController },
				new lib.InstanceCreateRequest(config, cloneFromId),
			);
		}

		it("rejects instance.assigned_host in the config", async function() {
			await assert.rejects(
				create({ "instance.id": 4001, "instance.name": "c1", "instance.assigned_host": 10 }),
				new lib.RequestError("instance.assigned_host must be set through the assign-host interface"),
			);
			assert.equal(mockController.instances.has(4001), false);
		});

		it("creates an unassigned clone of an assigned instance", async function() {
			await create({ "instance.id": 4001, "instance.name": "base" });
			mockController.instances.getMutable(4001).config.set("instance.assigned_host", 10);

			await create({ "instance.id": 4002, "instance.name": "clone", "instance.assigned_host": null }, 4001);
			const clone = mockController.instances.get(4002);
			assert.equal(clone.config.get("instance.name"), "clone");
			assert.equal(clone.config.get("instance.assigned_host"), null);
		});
	});
});
