<script lang="ts">
	import { Router, Route } from "svelte-routing";
	import TodoMvc from "./todo-mvc/todo-mvc.svelte";
  
	export let baseUrl = "";
  </script>

 <Router url={baseUrl}>
	  <Route path="/:status" component="{TodoMvc}"/>
	  <Route path="/" component="{TodoMvc}"/>
  </Router>